#!/bin/bash
# Docker Preflight - Docker build sanity check
# Exits with code 0 if Docker is not installed (non-fatal)

# Note: We handle errors explicitly for Docker checks

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print section header
print_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Function to print PASS
print_pass() {
    echo -e "${GREEN}✓ PASS: $1${NC}"
}

# Function to print FAIL
print_fail() {
    echo -e "${RED}✗ FAIL: $1${NC}"
}

# Function to print INFO
print_info() {
    echo -e "${YELLOW}ℹ INFO: $1${NC}"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_section "Docker Preflight Check"
    print_info "Docker is not installed on this system"
    echo ""
    echo "To install Docker:"
    echo "  - macOS: https://docs.docker.com/desktop/install/mac-install/"
    echo "  - Windows: https://docs.docker.com/desktop/install/windows-install/"
    echo "  - Linux: https://docs.docker.com/engine/install/"
    echo ""
    echo "Docker preflight check skipped (Docker not installed)"
    echo "This is not a failure - Docker is optional for local development"
    exit 0
fi

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    print_section "Docker Preflight Check"
    print_info "No Dockerfile found at repo root"
    echo "Docker preflight check skipped (no Dockerfile)"
    exit 0
fi

# Run Docker build check
print_section "Docker Preflight Check"
echo "Docker version: $(docker --version)"
echo ""
echo "Running Docker build sanity check..."
echo "This may take a few minutes..."
echo ""

if docker build --no-cache -t render-preflight .; then
    print_pass "Docker build completed successfully"
    echo ""
    echo "Cleaning up test image..."
    docker rmi render-preflight 2>/dev/null || true
    print_pass "Docker preflight check passed"
    exit 0
else
    print_fail "Docker build failed"
    echo ""
    echo "Please fix Docker build errors before deploying to Render"
    exit 1
fi

