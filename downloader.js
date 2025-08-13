#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');

const streamPipeline = promisify(pipeline);

class FileDownloader {
  constructor() {
    this.downloadDirectory = process.env.DOWNLOAD_DIRECTORY || '/mnt/volume_ams3_01';
    this.concurrentDownloads = parseInt(process.env.CONCURRENT_DOWNLOADS) || 3;
    this.timeout = parseInt(process.env.TIMEOUT_MS) || 30000;
    this.retryAttempts = parseInt(process.env.RETRY_ATTEMPTS) || 3;
    this.retryDelay = parseInt(process.env.RETRY_DELAY_MS) || 5000;
    this.logLevel = process.env.LOG_LEVEL || 'info';
    
    // Parse URLs from environment or command line arguments
    this.downloadUrls = this.parseDownloadUrls();
    
    this.completed = 0;
    this.failed = 0;
    this.total = this.downloadUrls.length;
    
    this.log('info', `FileDownloader initialized`);
    this.log('info', `Download directory: ${this.downloadDirectory}`);
    this.log('info', `Concurrent downloads: ${this.concurrentDownloads}`);
    this.log('info', `Total files to download: ${this.total}`);
  }

  parseDownloadUrls() {
    // First try to get URLs from environment variable
    if (process.env.DOWNLOAD_URLS) {
      return process.env.DOWNLOAD_URLS.split(',').map(url => url.trim()).filter(url => url);
    }
    
    // Then try command line arguments
    const args = process.argv.slice(2);
    if (args.length > 0) {
      return args;
    }
    
    // If no URLs provided, show usage and exit
    this.log('error', 'No download URLs provided!');
    this.log('info', 'Usage:');
    this.log('info', '  node downloader.js <url1> <url2> ...');
    this.log('info', '  or set DOWNLOAD_URLS in .env file');
    process.exit(1);
  }

  log(level, message) {
    const levels = { error: 0, warn: 1, info: 2 };
    const currentLevel = levels[this.logLevel] || 2;
    
    if (levels[level] <= currentLevel) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  async ensureDownloadDirectory() {
    try {
      await fs.ensureDir(this.downloadDirectory);
      this.log('info', `Download directory ready: ${this.downloadDirectory}`);
    } catch (error) {
      this.log('error', `Failed to create download directory: ${error.message}`);
      throw error;
    }
  }

  getFileName(url, headers = {}) {
    // Try to get filename from Content-Disposition header
    const contentDisposition = headers['content-disposition'];
    if (contentDisposition) {
      const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        return match[1].replace(/['"]/g, '');
      }
    }
    
    // Fall back to URL parsing
    const urlPath = new URL(url).pathname;
    const fileName = path.basename(urlPath) || `file_${Date.now()}`;
    
    // If no extension, try to guess from content-type
    if (!path.extname(fileName) && headers['content-type']) {
      const contentType = headers['content-type'];
      if (contentType.includes('application/zip')) return fileName + '.zip';
      if (contentType.includes('application/pdf')) return fileName + '.pdf';
      if (contentType.includes('text/')) return fileName + '.txt';
      if (contentType.includes('image/')) {
        if (contentType.includes('jpeg')) return fileName + '.jpg';
        if (contentType.includes('png')) return fileName + '.png';
      }
    }
    
    return fileName;
  }

  async downloadFile(url, attempt = 1) {
    try {
      this.log('info', `Starting download: ${url} (attempt ${attempt})`);
      
      // First, make a HEAD request to get file info
      const headResponse = await axios.head(url, { timeout: this.timeout });
      const fileName = this.getFileName(url, headResponse.headers);
      const filePath = path.join(this.downloadDirectory, fileName);
      
      // Check if file already exists
      if (await fs.pathExists(filePath)) {
        const stats = await fs.stat(filePath);
        const contentLength = parseInt(headResponse.headers['content-length']) || 0;
        
        if (contentLength > 0 && stats.size === contentLength) {
          this.log('info', `File already exists and is complete: ${fileName}`);
          return { success: true, fileName, filePath, skipped: true };
        } else {
          this.log('warn', `File exists but size mismatch, re-downloading: ${fileName}`);
        }
      }
      
      // Download the file
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: this.timeout,
        headers: {
          'User-Agent': 'FileDownloader/1.0.0'
        }
      });
      
      const writeStream = fs.createWriteStream(filePath);
      
      // Track download progress
      const contentLength = parseInt(response.headers['content-length']) || 0;
      let downloadedBytes = 0;
      
      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (contentLength > 0) {
          const progress = ((downloadedBytes / contentLength) * 100).toFixed(1);
          if (downloadedBytes % (1024 * 1024) < chunk.length) { // Log every MB
            this.log('info', `Downloading ${fileName}: ${progress}% (${this.formatBytes(downloadedBytes)}/${this.formatBytes(contentLength)})`);
          }
        }
      });
      
      await streamPipeline(response.data, writeStream);
      
      this.log('info', `Successfully downloaded: ${fileName} (${this.formatBytes(downloadedBytes)})`);
      return { success: true, fileName, filePath, bytes: downloadedBytes };
      
    } catch (error) {
      this.log('error', `Failed to download ${url} (attempt ${attempt}): ${error.message}`);
      
      if (attempt < this.retryAttempts) {
        this.log('info', `Retrying in ${this.retryDelay / 1000} seconds...`);
        await this.delay(this.retryDelay);
        return this.downloadFile(url, attempt + 1);
      } else {
        return { success: false, error: error.message, url };
      }
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

  async downloadAll() {
    await this.ensureDownloadDirectory();
    
    this.log('info', `Starting downloads with ${this.concurrentDownloads} concurrent connections...`);
    const startTime = Date.now();
    
    // Process downloads in batches
    const results = [];
    for (let i = 0; i < this.downloadUrls.length; i += this.concurrentDownloads) {
      const batch = this.downloadUrls.slice(i, i + this.concurrentDownloads);
      const batchPromises = batch.map(url => this.downloadFile(url));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Update counters
      batchResults.forEach(result => {
        if (result.success) {
          this.completed++;
        } else {
          this.failed++;
        }
      });
      
      this.log('info', `Progress: ${this.completed}/${this.total} completed, ${this.failed} failed`);
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    // Summary
    this.log('info', '='.repeat(50));
    this.log('info', 'Download Summary:');
    this.log('info', `Total files: ${this.total}`);
    this.log('info', `Successfully downloaded: ${this.completed}`);
    this.log('info', `Failed downloads: ${this.failed}`);
    this.log('info', `Duration: ${duration} seconds`);
    this.log('info', `Download directory: ${this.downloadDirectory}`);
    
    // Log failed downloads
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      this.log('warn', 'Failed downloads:');
      failedResults.forEach(result => {
        this.log('warn', `  ${result.url}: ${result.error}`);
      });
    }
    
    // Calculate total downloaded bytes
    const totalBytes = results
      .filter(r => r.success && r.bytes)
      .reduce((sum, r) => sum + r.bytes, 0);
    
    if (totalBytes > 0) {
      this.log('info', `Total downloaded: ${this.formatBytes(totalBytes)}`);
    }
    
    return results;
  }

  async start() {
    try {
      this.log('info', 'FileDownloader starting...');
      
      const results = await this.downloadAll();
      
      if (this.failed === 0) {
        this.log('info', 'All downloads completed successfully! Exiting...');
        process.exit(0);
      } else {
        this.log('error', `${this.failed} downloads failed. Exiting with error code...`);
        process.exit(1);
      }
      
    } catch (error) {
      this.log('error', `Fatal error: ${error.message}`);
      process.exit(1);
    }
  }
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

// Start the downloader
const downloader = new FileDownloader();
downloader.start();
