#!/bin/bash

# Demo script to show Plato TUI functionality
echo "================================"
echo "    Plato TUI Demo"
echo "================================"
echo ""
echo "This demo will show Plato's key features:"
echo "1. Starting Plato in CLI mode"
echo "2. Running slash commands"
echo "3. Attaching MCP server"
echo "4. Testing interactions"
echo ""

# Create an expect script to interact with Plato
cat > /tmp/plato-demo.exp << 'EOF'
#!/usr/bin/expect -f
set timeout 10

# Start Plato in CLI mode
spawn npm run dev -- --cli

# Wait for the prompt
expect "You:" {
    send "/help\r"
}

expect "You:" {
    send "/status\r"
}

expect "You:" {
    send "/model\r"
}

expect "You:" {
    send "/mcp attach mock http://localhost:8725\r"
}

expect "You:" {
    send "/mcp tools\r"
}

expect "You:" {
    send "What is TypeScript?\r"
}

expect "You:" {
    send "\003"
}

expect eof
EOF

chmod +x /tmp/plato-demo.exp

# Check if expect is installed
if command -v expect &> /dev/null; then
    echo "Running Plato demo with expect..."
    /tmp/plato-demo.exp
else
    echo "Expect not installed. Running simple demo instead..."

    # Simple demo without expect
    echo ""
    echo "Sample Plato commands:"
    echo "  /help        - Show available commands"
    echo "  /status      - Show current status"
    echo "  /model       - List and switch models"
    echo "  /mcp attach  - Attach MCP server"
    echo "  /mcp tools   - List available tools"
    echo "  /memory      - Manage conversation memory"
    echo "  /compact     - Compact conversation history"
    echo ""
    echo "To run Plato interactively:"
    echo "  npm run dev"
    echo ""
    echo "To run with specific flags:"
    echo "  npm run dev -- --cli        # Force CLI mode"
    echo "  npm run dev -- --print 'question'  # One-shot mode"
fi

echo ""
echo "Demo complete!"