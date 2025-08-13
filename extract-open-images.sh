#!/bin/bash

# Quick extraction script for open_images.zip
# This script extracts open_images.zip from /mnt/volume_ams3_01 to /mnt/unzippedimages

echo "Starting extraction of open_images.zip..."
echo "Source: /mnt/volume_ams3_01"
echo "Destination: /mnt/unzippedimages"
echo ""

# Stop any existing extraction process
pm2 delete archive-extractor 2>/dev/null || true

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the extraction with PM2
pm2 start extract-only.js \
  --name archive-extractor \
  --no-autorestart \
  --output ./logs/extract-out.log \
  --error ./logs/extract-err.log \
  -- /mnt/volume_ams3_01 /mnt/unzippedimages

# Show status
echo "Extraction started with PM2!"
echo ""
pm2 status

echo ""
echo "Monitor progress with:"
echo "  pm2 logs archive-extractor"
echo "  pm2 logs archive-extractor --lines 50"
echo ""
echo "Check status with:"
echo "  pm2 status"
echo ""
echo "Stop extraction with:"
echo "  pm2 stop archive-extractor"
