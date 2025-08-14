#!/bin/bash

# Extract train.tgz and val.tgz from /mnt/unzippedimages back to /mnt/volume_ams3_01
# Source: /mnt/unzippedimages/open_images/open_images/ (where train.tgz and val.tgz are)
# Destination: /mnt/volume_ams3_01 (the main disk with lots of space)

echo "Starting extraction of train.tgz and val.tgz..."
echo "Source: /mnt/unzippedimages/open_images/open_images/"
echo "Destination: /mnt/volume_ams3_01"
echo ""

# Stop any existing extraction process
pm2 delete train-val-extractor 2>/dev/null || true

# Create logs directory if it doesn't exist
mkdir -p logs

# Start the extraction with PM2
pm2 start extract-only.js \
  --name train-val-extractor \
  --no-autorestart \
  --output ./logs/train-val-out.log \
  --error ./logs/train-val-err.log \
  -- /mnt/unzippedimages/open_images/open_images /mnt/volume_ams3_01

# Show status
echo "Extraction started with PM2!"
echo ""
pm2 status

echo ""
echo "This will extract:"
echo "  train.tgz -> /mnt/volume_ams3_01/train/"
echo "  val.tgz   -> /mnt/volume_ams3_01/val/"
echo ""
echo "Monitor progress with:"
echo "  pm2 logs train-val-extractor"
echo "  pm2 logs train-val-extractor --lines 50"
echo ""
echo "Check status with:"
echo "  pm2 status"
echo ""
echo "Stop extraction with:"
echo "  pm2 stop train-val-extractor"
echo ""
echo "Watch disk usage:"
echo "  watch df -h"
