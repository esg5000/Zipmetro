#!/bin/bash
# Render Preflight - Pre-deploy validation script
# Exits non-zero on any failure

# Note: We don't use set -e here because we want to check all apps
# and report all failures, not exit on the first error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track overall status
OVERALL_STATUS=0

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
    OVERALL_STATUS=1
}

# Function to print WARNING
print_warning() {
    echo -e "${YELLOW}⚠ WARNING: $1${NC}"
}

# Function to check Node app directory
check_node_app() {
    local dir="$1"
    local dir_name="${dir:-root}"
    
    print_section "Checking Node app: $dir_name"
    
    # Check if package.json exists
    if [ ! -f "$dir/package.json" ]; then
        print_fail "$dir_name: package.json not found"
        return 1
    fi
    
    print_pass "$dir_name: package.json found"
    
    # Print Node and npm versions
    echo ""
    echo "Node version: $(node -v)"
    echo "npm version: $(npm -v)"
    
    # Check for package-lock.json
    if [ -f "$dir/package-lock.json" ]; then
        print_pass "$dir_name: package-lock.json found"
        echo "Running npm ci..."
        if (cd "$dir" && npm ci); then
            print_pass "$dir_name: npm ci completed"
        else
            print_fail "$dir_name: npm ci failed"
            return 1
        fi
    else
        print_warning "$dir_name: package-lock.json not found (recommended for production)"
        echo "Running npm install --include=dev..."
        if (cd "$dir" && npm install --include=dev); then
            print_pass "$dir_name: npm install completed"
        else
            print_fail "$dir_name: npm install failed"
            return 1
        fi
    fi
    
        # Check for scripts in package.json
        if [ -f "$dir/package.json" ]; then
            # Check for lint script
            if grep -q '"lint"' "$dir/package.json"; then
                # Skip if lint script is just a placeholder
                if ! grep -q '"lint".*"No linter' "$dir/package.json"; then
                    echo ""
                    echo "Running npm run lint..."
                    if (cd "$dir" && npm run lint); then
                        print_pass "$dir_name: npm run lint passed"
                    else
                        print_fail "$dir_name: npm run lint failed"
                        return 1
                    fi
                else
                    echo ""
                    echo "Skipping lint (placeholder detected)"
                fi
            fi
        
        # Check for test script
        if grep -q '"test"' "$dir/package.json"; then
            # Skip if test script is just a placeholder (exits with 0 and has "No tests" message)
            if ! grep -q '"test".*"No tests' "$dir/package.json" && ! grep -q '"test".*"Error: no test specified"' "$dir/package.json"; then
                echo ""
                echo "Running npm test..."
                if (cd "$dir" && npm test); then
                    print_pass "$dir_name: npm test passed"
                else
                    print_fail "$dir_name: npm test failed"
                    return 1
                fi
            else
                echo ""
                echo "Skipping test (placeholder detected)"
            fi
        fi
        
        # Check for build script
        if grep -q '"build"' "$dir/package.json"; then
            # Skip if build script is just a placeholder
            if ! grep -q '"build".*"No build' "$dir/package.json"; then
                echo ""
                echo "Running npm run build..."
                if (cd "$dir" && npm run build); then
                    print_pass "$dir_name: npm run build passed"
                else
                    print_fail "$dir_name: npm run build failed"
                    return 1
                fi
            else
                echo ""
                echo "Skipping build (placeholder detected)"
            fi
        fi
    fi
    
    return 0
}

# Main execution
print_section "Render Preflight Check"
echo "Starting pre-deploy validation..."
echo ""

# Detect Node app directories
NODE_APPS=()

# Check root directory
if [ -f "package.json" ]; then
    NODE_APPS+=(".")
fi

# Check first-level directories
for dir in */; do
    if [ -f "${dir}package.json" ]; then
        NODE_APPS+=("${dir%/}")
    fi
done

# If no Node apps found, exit with error
if [ ${#NODE_APPS[@]} -eq 0 ]; then
    print_fail "No Node.js applications found (no package.json files detected)"
    exit 1
fi

echo "Detected ${#NODE_APPS[@]} Node.js application(s):"
for app in "${NODE_APPS[@]}"; do
    echo "  - $app"
done
echo ""

# Check each Node app
for app in "${NODE_APPS[@]}"; do
    if ! check_node_app "$app"; then
        OVERALL_STATUS=1
    fi
done

# Final summary
print_section "Preflight Summary"
if [ $OVERALL_STATUS -eq 0 ]; then
    print_pass "All checks passed! Ready to deploy."
    exit 0
else
    print_fail "One or more checks failed. Please fix errors before deploying."
    exit 1
fi

