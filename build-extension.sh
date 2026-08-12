#!/bin/bash

# VDM Extension - Docker Build Script for Popup UI
# This script builds the React Popup UI without requiring Node.js or pnpm on the host machine.
# Output will be written directly to extension/popup-dist.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================="
echo " VDM Extension - Building Popup UI (Docker)"
echo "==========================================="

if ! command -v docker &> /dev/null; then
    echo "[!] Docker is not installed or not in PATH."
    echo "Please install Docker or install Node.js/pnpm to build locally."
    exit 1
fi

echo "[1/2] Compiling React Popup UI inside Node container..."

# Mount extension directory into /app inside container
# Run npm install & npm run build as current user to avoid permission issues
docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp \
    -e CI=true \
    -v "$SCRIPT_DIR/extension:/app" \
    -w /app/popup-app \
    node:20-alpine \
    sh -c "npx --yes pnpm install && npx --yes pnpm build"

echo "==========================================="
echo " Build Complete!"
echo " Output written to: extension/popup-dist/"
echo " Now you can load 'extension' folder in chrome://extensions"
echo "==========================================="
