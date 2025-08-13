#!/usr/bin/env node

// Standalone extraction script for existing .tgz files
// Usage: node extract-only.js [source_directory] [destination_directory]

require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const tar = require('tar');

class ArchiveExtractor {
  constructor(sourceDir, destDir) {
    this.sourceDirectory = sourceDir || process.env.UNZIP_SOURCE_DIRECTORY || '/mnt/volume_ams3_01';
    this.destinationDirectory = destDir || process.env.UNZIP_DESTINATION_DIRECTORY || '/mnt/volume_ams3_02';
    this.deleteAfterUnzip = process.env.DELETE_AFTER_UNZIP === 'true';
    this.concurrentExtractions = parseInt(process.env.CONCURRENT_EXTRACTIONS) || 2;
    this.retryAttempts = parseInt(process.env.RETRY_ATTEMPTS) || 3;
    this.retryDelay = parseInt(process.env.RETRY_DELAY_MS) || 5000;
    this.logLevel = process.env.LOG_LEVEL || 'info';
    
    this.extractedFiles = 0;
    this.failedExtractions = 0;
    
    this.log('info', `ArchiveExtractor initialized`);
    this.log('info', `Source directory: ${this.sourceDirectory}`);
    this.log('info', `Destination directory: ${this.destinationDirectory}`);
    this.log('info', `Concurrent extractions: ${this.concurrentExtractions}`);
    this.log('info', `Delete after extraction: ${this.deleteAfterUnzip}`);
  }

  log(level, message) {
    const levels = { error: 0, warn: 1, info: 2 };
    const currentLevel = levels[this.logLevel] || 2;
    
    if (levels[level] <= currentLevel) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isSupportedArchive(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.tgz', '.tar.gz', '.tar', '.gz'].includes(ext) || filename.endsWith('.tar.gz');
  }

  async getDirectoryStats(dirPath) {
    let totalSize = 0;
    let fileCount = 0;
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          const subStats = await this.getDirectoryStats(itemPath);
          totalSize += subStats.size;
          fileCount += subStats.files;
        } else if (item.isFile()) {
          const stats = await fs.stat(itemPath);
          totalSize += stats.size;
          fileCount++;
        }
      }
    } catch (error) {
      this.log('warn', `Could not read directory stats for ${dirPath}: ${error.message}`);
    }
    
    return { size: totalSize, files: fileCount };
  }

  async extractTgzFile(sourceFilePath, destinationDir, attempt = 1) {
    try {
      const fileName = path.basename(sourceFilePath);
      this.log('info', `Starting extraction: ${fileName} -> ${destinationDir} (attempt ${attempt})`);
      
      // Ensure destination directory exists
      await fs.ensureDir(destinationDir);
      
      // Extract the archive
      await tar.extract({
        file: sourceFilePath,
        cwd: destinationDir,
        preservePaths: false,  // Remove leading paths for security
        onentry: (entry) => {
          if (entry.type === 'File' && entry.size > 1024 * 1024) { // Log files > 1MB
            this.log('info', `Extracting: ${entry.path} (${this.formatBytes(entry.size)})`);
          }
        }
      });
      
      // Get extracted size by checking directory
      const stats = await this.getDirectoryStats(destinationDir);
      
      this.log('info', `Successfully extracted: ${fileName} (${stats.files} files, ${this.formatBytes(stats.size)})`);
      
      // Delete source file if configured
      if (this.deleteAfterUnzip) {
        await fs.remove(sourceFilePath);
        this.log('info', `Deleted source file: ${fileName}`);
      }
      
      return { 
        success: true, 
        fileName, 
        sourceFilePath, 
        destinationDir,
        extractedFiles: stats.files,
        extractedSize: stats.size 
      };
      
    } catch (error) {
      this.log('error', `Failed to extract ${sourceFilePath} (attempt ${attempt}): ${error.message}`);
      
      if (attempt < this.retryAttempts) {
        this.log('info', `Retrying extraction in ${this.retryDelay / 1000} seconds...`);
        await this.delay(this.retryDelay);
        return this.extractTgzFile(sourceFilePath, destinationDir, attempt + 1);
      } else {
        return { success: false, error: error.message, sourceFilePath };
      }
    }
  }

  async findArchiveFiles() {
    this.log('info', `Scanning for archive files in: ${this.sourceDirectory}`);
    
    const archiveFiles = [];
    
    try {
      // Check if source directory exists
      if (!await fs.pathExists(this.sourceDirectory)) {
        throw new Error(`Source directory does not exist: ${this.sourceDirectory}`);
      }
      
      const files = await fs.readdir(this.sourceDirectory);
      
      for (const file of files) {
        const filePath = path.join(this.sourceDirectory, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile() && this.isSupportedArchive(file)) {
          archiveFiles.push({
            path: filePath,
            name: file,
            size: stats.size
          });
        }
      }
    } catch (error) {
      this.log('error', `Failed to scan source directory: ${error.message}`);
      throw error;
    }
    
    this.log('info', `Found ${archiveFiles.length} archive files to extract`);
    
    // Log details of found archives
    if (archiveFiles.length > 0) {
      this.log('info', 'Archive files found:');
      archiveFiles.forEach(archive => {
        this.log('info', `  ${archive.name} (${this.formatBytes(archive.size)})`);
      });
    }
    
    return archiveFiles;
  }

  async extractAll() {
    try {
      await fs.ensureDir(this.destinationDirectory);
      
      const archiveFiles = await this.findArchiveFiles();
      
      if (archiveFiles.length === 0) {
        this.log('info', 'No archive files found to extract');
        return [];
      }
      
      this.log('info', `Starting extraction of ${archiveFiles.length} archives with ${this.concurrentExtractions} concurrent extractions...`);
      const startTime = Date.now();
      
      // Process extractions in batches
      const results = [];
      for (let i = 0; i < archiveFiles.length; i += this.concurrentExtractions) {
        const batch = archiveFiles.slice(i, i + this.concurrentExtractions);
        const batchPromises = batch.map(archive => {
          const destDir = path.join(this.destinationDirectory, path.parse(archive.name).name);
          return this.extractTgzFile(archive.path, destDir);
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Update counters
        batchResults.forEach(result => {
          if (result.success) {
            this.extractedFiles++;
          } else {
            this.failedExtractions++;
          }
        });
        
        this.log('info', `Extraction progress: ${this.extractedFiles}/${archiveFiles.length} completed, ${this.failedExtractions} failed`);
      }
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      // Summary
      this.log('info', '='.repeat(60));
      this.log('info', 'Extraction Summary:');
      this.log('info', `Total archives: ${archiveFiles.length}`);
      this.log('info', `Successfully extracted: ${this.extractedFiles}`);
      this.log('info', `Failed extractions: ${this.failedExtractions}`);
      this.log('info', `Duration: ${duration} seconds`);
      this.log('info', `Source directory: ${this.sourceDirectory}`);
      this.log('info', `Destination directory: ${this.destinationDirectory}`);
      
      // Log failed extractions
      const failedResults = results.filter(r => !r.success);
      if (failedResults.length > 0) {
        this.log('warn', 'Failed extractions:');
        failedResults.forEach(result => {
          this.log('warn', `  ${result.sourceFilePath}: ${result.error}`);
        });
      }
      
      // Calculate total extracted data
      const totalExtractedFiles = results
        .filter(r => r.success && r.extractedFiles)
        .reduce((sum, r) => sum + r.extractedFiles, 0);
      
      const totalExtractedSize = results
        .filter(r => r.success && r.extractedSize)
        .reduce((sum, r) => sum + r.extractedSize, 0);
      
      if (totalExtractedSize > 0) {
        this.log('info', `Total extracted: ${totalExtractedFiles} files, ${this.formatBytes(totalExtractedSize)}`);
      }
      
      return results;
      
    } catch (error) {
      this.log('error', `Fatal error during extraction: ${error.message}`);
      throw error;
    }
  }

  async start() {
    try {
      this.log('info', 'Archive extraction starting...');
      
      const results = await this.extractAll();
      
      if (this.failedExtractions === 0) {
        this.log('info', 'All extractions completed successfully! Exiting...');
        process.exit(0);
      } else {
        this.log('error', `${this.failedExtractions} extractions failed. Exiting with error code...`);
        process.exit(1);
      }
      
    } catch (error) {
      this.log('error', `Fatal error: ${error.message}`);
      process.exit(1);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const sourceDir = args[0];
const destDir = args[1];

if (args.includes('--help') || args.includes('-h')) {
  console.log('Archive Extractor - Extract .tgz files from one directory to another');
  console.log('');
  console.log('Usage:');
  console.log('  node extract-only.js [source_directory] [destination_directory]');
  console.log('');
  console.log('Examples:');
  console.log('  node extract-only.js /mnt/volume_ams3_01 /mnt/volume_ams3_02');
  console.log('  node extract-only.js  # Uses .env configuration');
  console.log('');
  console.log('Configuration via .env file:');
  console.log('  UNZIP_SOURCE_DIRECTORY=/mnt/volume_ams3_01');
  console.log('  UNZIP_DESTINATION_DIRECTORY=/mnt/volume_ams3_02');
  console.log('  DELETE_AFTER_UNZIP=false');
  console.log('  CONCURRENT_EXTRACTIONS=2');
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Start the extractor
const extractor = new ArchiveExtractor(sourceDir, destDir);
extractor.start();
