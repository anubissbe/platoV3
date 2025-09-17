#!/bin/bash

# Test all Plato TUI commands systematically
# Output results to command-test-results.txt

OUTPUT_FILE="command-test-results.txt"
echo "=== PLATO TUI COMMAND TEST RESULTS ===" > $OUTPUT_FILE
echo "Date: $(date)" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# Function to test a command
test_command() {
    local cmd="$1"
    local desc="$2"
    echo "" >> $OUTPUT_FILE
    echo "Testing: $cmd" >> $OUTPUT_FILE
    echo "Description: $desc" >> $OUTPUT_FILE
    echo "---" >> $OUTPUT_FILE

    # Run command and capture output
    result=$(echo "$cmd" | timeout 2 npx tsx src/cli.ts --cli 2>&1 | tail -20)

    # Check if command produced output
    if [[ -z "$result" ]]; then
        echo "❌ NO OUTPUT" >> $OUTPUT_FILE
    elif [[ "$result" == *"Unknown command"* ]]; then
        echo "❌ UNKNOWN COMMAND" >> $OUTPUT_FILE
    elif [[ "$result" == *"Error"* ]] || [[ "$result" == *"error"* ]]; then
        echo "⚠️ ERROR OCCURRED" >> $OUTPUT_FILE
        echo "$result" | head -5 >> $OUTPUT_FILE
    else
        echo "✅ WORKING" >> $OUTPUT_FILE
        echo "$result" | head -10 >> $OUTPUT_FILE
    fi
}

# Core Commands
test_command "/help" "Display help information"
test_command "/status" "Show system status"
test_command "/model" "Manage AI models"
test_command "/login" "Authenticate user"
test_command "/logout" "End session"
test_command "/config" "Manage configuration"
test_command "/settings" "User preferences"
test_command "/permissions" "Permission management"
test_command "/resume" "Resume session"
test_command "/memory" "Memory management"

# Development Commands
test_command "/edit" "Edit files"
test_command "/search" "Search codebase"
test_command "/run" "Execute commands"
test_command "/test" "Run tests"
test_command "/git" "Git operations"
test_command "/browse" "Browse files"
test_command "/create" "Create resources"
test_command "/delete" "Delete resources"
test_command "/move" "Move resources"
test_command "/doctor" "System diagnostics"
test_command "/compact" "Optimize storage"
test_command "/export" "Export data"

# Advanced Commands
test_command "/todos" "Task management"
test_command "/mcp" "MCP server management"
test_command "/cost" "Cost analytics"
test_command "/analytics" "Advanced analytics"
test_command "/privacy-settings" "Privacy controls"
test_command "/debug" "Debug mode"
test_command "/context" "Context management"
test_command "/apply-mode" "Apply mode settings"
test_command "/tool-call-preset" "Tool presets"
test_command "/ide" "IDE integration"
test_command "/install-gitlab-app" "GitLab integration"
test_command "/terminal-setup" "Terminal config"

# UI/UX Commands
test_command "/mouse" "Mouse mode control"
test_command "/paste" "Paste mode"
test_command "/output-style" "Output formatting"
test_command "/vim" "Vim mode"
test_command "/proxy" "Proxy management"
test_command "/bug" "Bug reporting"
test_command "/bashes" "Shell sessions"
test_command "/upgrade" "Upgrade information"

# Enterprise Commands (may not be implemented)
test_command "/deploy" "Deployment management"
test_command "/monitor" "System monitoring"
test_command "/audit" "Security audit"
test_command "/compliance" "Compliance checks"

echo "" >> $OUTPUT_FILE
echo "=== TEST COMPLETE ===" >> $OUTPUT_FILE

# Generate summary
echo "" >> $OUTPUT_FILE
echo "=== SUMMARY ===" >> $OUTPUT_FILE
working=$(grep -c "✅ WORKING" $OUTPUT_FILE)
errors=$(grep -c "⚠️ ERROR" $OUTPUT_FILE)
unknown=$(grep -c "❌ UNKNOWN" $OUTPUT_FILE)
no_output=$(grep -c "❌ NO OUTPUT" $OUTPUT_FILE)

echo "Working Commands: $working" >> $OUTPUT_FILE
echo "Commands with Errors: $errors" >> $OUTPUT_FILE
echo "Unknown Commands: $unknown" >> $OUTPUT_FILE
echo "No Output: $no_output" >> $OUTPUT_FILE

# Display summary
cat $OUTPUT_FILE | tail -10