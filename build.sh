#!/bin/bash

# VDM Desktop Cross-Platform Build Script
# This script uses Wails v3 built-in Docker cross-compilation support to build for Windows, macOS, and Linux.
# Ensure that Docker is installed and running on your system before executing this script.

set -e

echo "==========================================="
echo " VDM Desktop - Cross-Platform Build System"
echo "==========================================="

if ! command -v docker &> /dev/null; then
    echo "[!] Docker is not installed or not in PATH."
    echo "Please install Docker to use the cross-compilation system."
    exit 1
fi

if ! command -v wails3 &> /dev/null; then
    echo "[!] wails3 CLI is not installed."
    echo "Please install it with: go install github.com/wailsapp/wails/v3/cmd/wails3@latest"
    exit 1
fi

cd desktop/

echo "[1/4] Setting up Docker environment for Wails v3..."
wails3 task setup:docker

mkdir -p releases

echo "[2/4] Building for Windows (x86_64)..."
wails3 build GOOS=windows GOARCH=amd64
cp bin/desktop.exe releases/vdm-windows-amd64.exe || echo "Failed to copy Windows binary"

echo "[3/4] Building for Linux (x86_64)..."
wails3 build GOOS=linux GOARCH=amd64
cp bin/desktop releases/vdm-linux-amd64 || echo "Failed to copy Linux binary"

echo "[4/4] Building for macOS (Universal / ARM64 & Intel)..."
# Build for Apple Silicon
wails3 build GOOS=darwin GOARCH=arm64
cp bin/desktop releases/vdm-macos-arm64 || echo "Failed to copy macOS ARM binary"

# Build for Intel Mac
wails3 build GOOS=darwin GOARCH=amd64
cp bin/desktop releases/vdm-macos-amd64 || echo "Failed to copy macOS Intel binary"

# Note: For universal binary, wails3 provides a specific task:
# wails3 task darwin:build:universal

echo "==========================================="
echo " Build Complete! Check the desktop/releases folder."
echo "==========================================="
