#!/bin/bash

# Script to test all Plato slash commands
# Outputs results to test-commands-output.txt

OUTPUT_FILE="test-commands-output.txt"
echo "Testing all Plato slash commands - $(date)" > $OUTPUT_FILE
echo "==========================================" >> $OUTPUT_FILE

# List of all commands to test
COMMANDS=(
    "/help"
    "/status"
    "/statusline"
    "/init"
    "/agents"
    "/permissions"
    "/model"
    "/mouse"
    "/paste"
    "/context"
    "/add-dir"
    "/bashes"
    "/memory"
    "/output-style"
    "/output-style:new"
    "/cost"
    "/analytics"
    "/doctor"
    "/compact"
    "/export"
    "/mcp"
    "/login"
    "/logout"
    "/hooks"
    "/security-review"
    "/todos"
    "/vim"
    "/proxy"
    "/upgrade"
    "/resume"
    "/privacy-settings"
    "/release-notes"
    "/keydebug"
    "/apply-mode"
    "/ide"
    "/install-gitlab-app"
    "/terminal-setup"
    "/bug"
)

# Function to test a single command
test_command() {
    local cmd=$1
    echo "" >> $OUTPUT_FILE
    echo "Testing: $cmd" >> $OUTPUT_FILE
    echo "-------------------" >> $OUTPUT_FILE

    # Use timeout and pipe the command
    echo "$cmd" | timeout 3 npm run dev -- --cli 2>&1 | tail -30 >> $OUTPUT_FILE

    # Check exit status
    if [ $? -eq 0 ]; then
        echo "✓ Command executed" >> $OUTPUT_FILE
    else
        echo "✗ Command failed or timed out" >> $OUTPUT_FILE
    fi

    echo "-------------------" >> $OUTPUT_FILE
}

# Test each command
for cmd in "${COMMANDS[@]}"; do
    echo "Testing $cmd..."
    test_command "$cmd"
    sleep 1  # Small delay between commands
done

echo "" >> $OUTPUT_FILE
echo "Test completed - $(date)" >> $OUTPUT_FILE

echo "Tests complete. Results saved to $OUTPUT_FILE"