#!/bin/bash

# Start Download Script for PM2
# Usage: ./start-download.sh <URL1> <URL2> ... <URLN>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <URL1> [URL2] [URL3] ..."
    echo "Example: $0 https://example.com/file1.zip https://example.com/file2.pdf"
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Join all arguments with spaces
DOWNLOAD_URLS="$*"

echo "Starting download with PM2..."
echo "URLs: $DOWNLOAD_URLS"
echo "Download directory: /mnt/volume_ams3_01"

# Stop any existing instance
pm2 delete dataset-downloader 2>/dev/null || true

# Start the downloader with the URLs as arguments
DOWNLOAD_URL="$DOWNLOAD_URLS" pm2 start ecosystem.config.js

# Show status
pm2 status

echo ""
echo "Monitor logs with: pm2 logs dataset-downloader"
echo "Check status with: pm2 status"
echo "Stop with: pm2 stop dataset-downloader"
