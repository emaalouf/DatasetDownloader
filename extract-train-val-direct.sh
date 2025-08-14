#!/bin/bash

# Direct extraction of train.tgz and val.tgz without PM2
# This runs in the foreground so you can see progress immediately

SOURCE_DIR="/mnt/unzippedimages/open_images/open_images"
DEST_DIR="/mnt/volume_ams3_01"

echo "=========================================="
echo "Extracting OpenImages train and val data"
echo "=========================================="
echo "Source: $SOURCE_DIR"
echo "Destination: $DEST_DIR"
echo ""

# Check if source files exist
if [ ! -f "$SOURCE_DIR/train.tgz" ]; then
    echo "ERROR: train.tgz not found in $SOURCE_DIR"
    exit 1
fi

if [ ! -f "$SOURCE_DIR/val.tgz" ]; then
    echo "ERROR: val.tgz not found in $SOURCE_DIR"
    exit 1
fi

echo "Found files:"
ls -lh "$SOURCE_DIR"/*.tgz
echo ""

# Run the extraction directly
cd /root/DatasetDownloader
node extract-only.js "$SOURCE_DIR" "$DEST_DIR"

echo ""
echo "=========================================="
echo "Extraction completed!"
echo "=========================================="
echo "Check results:"
echo "  ls -la $DEST_DIR"
echo "  df -h"
