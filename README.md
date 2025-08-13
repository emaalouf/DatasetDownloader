# Dataset Downloader

A Node.js file downloader designed to work with PM2 for reliable, managed downloads.

## Features

- Downloads files to `/mnt/volume_ams3_01` directory
- **NEW: Automatic extraction of .tgz files from one disk to another**
- Concurrent downloads and extractions (configurable)
- Progress tracking and logging
- Automatic retry on failures
- Graceful exit when complete (PM2 compatible)
- Resume capability (skips already downloaded files)
- Supports .tgz, .tar.gz, .tar, and .gz archives

## Installation

```bash
# Install dependencies
npm install

# Install PM2 globally (if not already installed)
npm install -g pm2
```

## Usage

### Method 1: Using the shell script (Recommended)

```bash
# Make script executable (if not already)
chmod +x start-download.sh

# Start download with single URL
./start-download.sh https://ziponthefly.energycdn.com/download/xLLpEEh8xX69GQl0XjaNqA/open_images.zip

# Start download with multiple URLs
./start-download.sh https://example.com/file1.zip https://example.com/file2.pdf
```

### Method 2: Using PM2 directly

```bash
# Stop any existing instance
pm2 delete dataset-downloader

# Start with URLs as arguments
pm2 start downloader.js --name dataset-downloader -- https://ziponthefly.energycdn.com/download/xLLpEEh8xX69GQl0XjaNqA/open_images.zip

# Or start multiple URLs
pm2 start downloader.js --name dataset-downloader -- https://example.com/file1.zip https://example.com/file2.pdf
```

### Method 3: Using ecosystem file

```bash
# Set the URL environment variable and start
DOWNLOAD_URL="https://ziponthefly.energycdn.com/download/xLLpEEh8xX69GQl0XjaNqA/open_images.zip" pm2 start ecosystem.config.js
```

## Monitoring

```bash
# Check process status
pm2 status

# View logs
pm2 logs dataset-downloader

# View logs in real-time
pm2 logs dataset-downloader --lines 100

# Stop the process
pm2 stop dataset-downloader

# Delete the process
pm2 delete dataset-downloader
```

## Configuration

Edit the `.env` file to customize behavior:

```bash
# Download Configuration
DOWNLOAD_DIRECTORY=/mnt/volume_ams3_01
CONCURRENT_DOWNLOADS=3
TIMEOUT_MS=30000
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=5000
LOG_LEVEL=info

# NEW: Unzip Configuration
AUTO_UNZIP=true
UNZIP_SOURCE_DIRECTORY=/mnt/volume_ams3_01
UNZIP_DESTINATION_DIRECTORY=/mnt/volume_ams3_02
DELETE_AFTER_UNZIP=false
CONCURRENT_EXTRACTIONS=2
```

## How it works

1. The downloader accepts URLs as command-line arguments
2. Downloads files to the specified directory (`/mnt/volume_ams3_01`)
3. **NEW: If `AUTO_UNZIP=true`, automatically extracts .tgz files to another directory (`/mnt/volume_ams3_02`)**
4. Shows progress and logs all activities
5. Automatically exits when all downloads and extractions are complete
6. PM2 will not restart the process since `autorestart: false` is set

## Archive Extraction

### Automatic Extraction (during download)
Set `AUTO_UNZIP=true` in `.env` to automatically extract downloaded archives.

### Manual Extraction (standalone)
Use the standalone extraction script for existing .tgz files:

```bash
# Extract all .tgz files from source to destination
node extract-only.js /mnt/volume_ams3_01 /mnt/volume_ams3_02

# Or use .env configuration
node extract-only.js

# With PM2
pm2 start extract-only.js --name archive-extractor

# Show help
node extract-only.js --help
```

### Supported Archive Formats
- `.tgz` files
- `.tar.gz` files  
- `.tar` files
- `.gz` files (single file compression)

## Troubleshooting

- **Process keeps restarting**: Make sure `autorestart: false` is set in the ecosystem file
- **Permission denied**: Ensure the download directory exists and is writable
- **Network timeouts**: Increase `TIMEOUT_MS` in the `.env` file
- **Memory issues**: Reduce `CONCURRENT_DOWNLOADS` in the `.env` file

## Example Commands for Your Case

For the specific URL you tried:

```bash
# Using the shell script (easiest)
./start-download.sh https://ziponthefly.energycdn.com/download/xLLpEEh8xX69GQl0XjaNqA/open_images.zip

# Or using PM2 directly
pm2 start downloader.js --name dataset-downloader -- https://ziponthefly.energycdn.com/download/xLLpEEh8xX69GQl0XjaNqA/open_images.zip
```
