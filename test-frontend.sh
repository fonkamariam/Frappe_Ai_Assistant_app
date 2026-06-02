#!/bin/bash

# Simplified test runner for Docker environments
# Tests can be run while bench is running in another container/terminal

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_header "AI Assistant - Frontend Tests (Playwright)"
echo "Make sure bench is running in another terminal:"
echo "  bench start"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYWRIGHT_DIR="$SCRIPT_DIR/tests/playwright"

cd "$PLAYWRIGHT_DIR"

case "${1:-all}" in
    all)
        print_info "Running all Playwright tests..."
        npx playwright test --reporter=html
        print_success "Tests completed! View report with: npx playwright show-report"
        ;;
    debug)
        print_info "Running in debug mode..."
        npx playwright test --debug
        ;;
    watch)
        print_info "Running in watch mode..."
        npx playwright test --watch
        ;;
    ui)
        print_info "Running in UI mode..."
        npx playwright test --ui
        ;;
    report)
        print_info "Opening test report..."
        npx playwright show-report
        ;;
    headed)
        print_info "Running with browser visible..."
        npx playwright test --headed
        ;;
    chromium)
        print_info "Running on Chromium only..."
        npx playwright test --project=chromium
        ;;
    firefox)
        print_info "Running on Firefox only..."
        npx playwright test --project=firefox
        ;;
    webkit)
        print_info "Running on WebKit only..."
        npx playwright test --project=webkit
        ;;
    install)
        print_info "Installing browsers..."
        npx playwright install
        ;;
    *)
        echo "Usage: $0 {all|debug|watch|ui|report|headed|chromium|firefox|webkit|install}"
        echo ""
        echo "Options:"
        echo "  all       - Run all tests"
        echo "  debug     - Run with debugger"
        echo "  watch     - Watch mode (re-run on changes)"
        echo "  ui        - Visual UI mode"
        echo "  report    - View last test report"
        echo "  headed    - Run with browser visible"
        echo "  chromium  - Chromium only"
        echo "  firefox   - Firefox only"
        echo "  webkit    - WebKit only"
        echo "  install   - Install Playwright browsers"
        exit 1
        ;;
esac
