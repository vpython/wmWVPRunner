#!/bin/bash
set -e  # Exit on error

#gcloud builds submit --tag us.gcr.io/glowscript/wmvvprunner .
#gcloud run deploy wmvvprunner --image us.gcr.io/glowscript/wmvvprunner
# check .env for correct env vars

# Disable gsutil multiprocessing to avoid macOS issues
# See: https://bugs.python.org/issue33725
export GSUTIL_OPTS="-o GSUtil:parallel_process_count=1"

echo "=== Starting build and deploy ==="

# Set CORS configuration for the bucket
echo "Setting CORS configuration..."
gsutil cors set cors.json gs://wmvprunner || {
    echo "Warning: CORS set failed, continuing anyway..."
}

# Clean out old build artifacts from bucket (except vpython.zip and .whl files)
echo "Cleaning old build artifacts..."
gsutil $GSUTIL_OPTS -m rm -r gs://wmvprunner/_app/ 2>/dev/null || echo "No _app/ directory to clean"
gsutil $GSUTIL_OPTS rm gs://wmvprunner/index.html gs://wmvprunner/favicon.png 2>/dev/null || echo "No old index.html/favicon.png to clean"

# Build the app
echo "Building app with npm..."
npm run build

# Check if build directory exists
if [ ! -d "build" ]; then
    echo "ERROR: build directory not found!"
    exit 1
fi

# Upload with proper cache control headers
echo "Uploading build files to GCS..."
gsutil $GSUTIL_OPTS -m -h "Cache-Control:public, max-age=3600" cp -r build/* gs://wmvprunner/ || {
    echo "ERROR: Upload failed!"
    exit 1
}

# Set proper content types and no-cache for critical files
echo "Setting metadata on index.html..."
gsutil setmeta -h "Cache-Control:no-cache, no-store, must-revalidate" gs://wmvprunner/index.html || {
    echo "Warning: Failed to set metadata on index.html"
}

echo "Setting metadata on vpython.zip..."
gsutil setmeta -h "Content-Type:application/zip" -h "Cache-Control:no-cache" gs://wmvprunner/vpython.zip || {
    echo "Warning: Failed to set metadata on vpython.zip"
}

# Only try to set .whl metadata if .whl files exist in bucket
echo "Checking for .whl files..."
if gsutil $GSUTIL_OPTS ls gs://wmvprunner/*.whl 2>/dev/null; then
    echo "Setting metadata on .whl files..."
    gsutil $GSUTIL_OPTS -m setmeta -h "Content-Type:application/octet-stream" -h "Cache-Control:no-cache" gs://wmvprunner/*.whl || {
        echo "Warning: Failed to set metadata on .whl files"
    }
else
    echo "No .whl files found, skipping metadata update"
fi

echo "=== Deploy complete! ==="
