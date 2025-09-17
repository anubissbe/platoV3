import { MessageBubble } from "../MessageBubble";
import type { MessageBubbleProps } from "../MessageBubble";

// Test utilities for message bubble testing
const createMockMessage = (overrides: Partial<MessageBubbleProps> = {}): MessageBubbleProps => ({
  role: "user",
  content: "Test message",
  timestamp: new Date("2025-09-16T10:30:00"),
  ...overrides,
});

describe("MessageBubble Core Functionality", () => {
  describe("Component Structure", () => {
    it("should create message bubble with required properties", () => {
      const props = createMockMessage();
      const bubble = new MessageBubble(props);

      expect(bubble.role).toBe("user");
      expect(bubble.content).toBe("Test message");
      expect(bubble.timestamp).toBeInstanceOf(Date);
    });

    it("should support different roles", () => {
      const userBubble = new MessageBubble(createMockMessage({ role: "user" }));
      const assistantBubble = new MessageBubble(createMockMessage({ role: "assistant" }));
      const systemBubble = new MessageBubble(createMockMessage({ role: "system" }));

      expect(userBubble.role).toBe("user");
      expect(assistantBubble.role).toBe("assistant");
      expect(systemBubble.role).toBe("system");
    });

    it("should format timestamps correctly", () => {
      const date = new Date("2025-09-16T10:30:00");
      const bubble = new MessageBubble(createMockMessage({ timestamp: date }));

      expect(bubble.getFormattedTime()).toMatch(/10:30:00/);
      expect(bubble.getRelativeTime()).toBeDefined();
    });
  });

  describe("Enhanced Visual Features", () => {
    it("should generate bordered message bubble with box-drawing characters", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "Hello world"
      }));

      const bordered = bubble.getBorderedContent(40);

      // Should contain Unicode box-drawing characters or boxen output
      expect(bordered).toBeTruthy();
      expect(bordered.length).toBeGreaterThan(0);
    });

    it("should calculate message width correctly with content", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "Short message"
      }));

      const width = bubble.calculateOptimalWidth(80);
      expect(width).toBeGreaterThan(15); // Minimum for content + padding
      expect(width).toBeLessThanOrEqual(80); // Should not exceed terminal width
    });

    it("should handle long content with word wrapping", () => {
      const longContent = "This is a very long message that should wrap properly within the bubble boundaries and maintain proper formatting throughout the entire content.";
      const bubble = new MessageBubble(createMockMessage({
        content: longContent
      }));

      const wrapped = bubble.getWrappedContent(40);
      expect(wrapped.length).toBeGreaterThan(1); // Should create multiple lines
      expect(wrapped.every(line => line.length <= 36)).toBe(true); // Account for padding
    });

    it("should apply role-based styling and colors", () => {
      const userBubble = new MessageBubble(createMockMessage({ role: "user" }));
      const assistantBubble = new MessageBubble(createMockMessage({ role: "assistant" }));

      expect(userBubble.getBubbleStyle().color).toBe("blue");
      expect(userBubble.getBubbleStyle().alignment).toBe("right");

      expect(assistantBubble.getBubbleStyle().color).toBe("green");
      expect(assistantBubble.getBubbleStyle().alignment).toBe("left");
    });
  });

  describe("Role Indicators and Avatars", () => {
    it("should provide correct role indicators and avatars", () => {
      const userBubble = new MessageBubble(createMockMessage({ role: "user" }));
      const assistantBubble = new MessageBubble(createMockMessage({ role: "assistant" }));
      const systemBubble = new MessageBubble(createMockMessage({ role: "system" }));

      expect(userBubble.getRoleIndicator()).toBe("👤");
      expect(assistantBubble.getRoleIndicator()).toBe("🤖");
      expect(systemBubble.getRoleIndicator()).toBe("⚙️");
    });

    it("should provide fallback text indicators for terminals without emoji support", () => {
      const userBubble = new MessageBubble(createMockMessage({ role: "user" }));
      const assistantBubble = new MessageBubble(createMockMessage({ role: "assistant" }));

      expect(userBubble.getFallbackIndicator()).toBe("[U]");
      expect(assistantBubble.getFallbackIndicator()).toBe("[A]");
    });

    it("should provide correct role colors", () => {
      const userBubble = new MessageBubble(createMockMessage({ role: "user" }));
      const assistantBubble = new MessageBubble(createMockMessage({ role: "assistant" }));

      expect(userBubble.getRoleColor()).toBe("blue");
      expect(assistantBubble.getRoleColor()).toBe("green");
    });
  });

  describe("Content Formatting and Code Blocks", () => {
    it("should handle multiline content", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "Line 1\nLine 2\nLine 3"
      }));

      const lines = bubble.getContentLines();
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe("Line 1");
      expect(lines[1]).toBe("Line 2");
      expect(lines[2]).toBe("Line 3");
    });

    it("should truncate long content when needed", () => {
      const longContent = "A".repeat(1000);
      const bubble = new MessageBubble(createMockMessage({
        content: longContent
      }));

      const truncated = bubble.getTruncatedContent(100);
      expect(truncated.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(truncated).toContain("...");
    });

    it("should detect and mark code blocks", () => {
      const contentWithCode = 'Here is some code:\n```javascript\nconsole.log("test");\n```';
      const bubble = new MessageBubble(createMockMessage({
        content: contentWithCode
      }));

      expect(bubble.hasCodeBlocks()).toBe(true);
      const codeBlocks = bubble.getCodeBlocks();
      expect(codeBlocks).toHaveLength(1);
      expect(codeBlocks[0].language).toBe("javascript");
      expect(codeBlocks[0].code).toContain("console.log");
    });
  });

  describe("Status Indicators and Animation", () => {
    it("should support status indicators", () => {
      const bubble = new MessageBubble(createMockMessage({
        role: "assistant",
        content: "Processing...",
        status: "streaming"
      }));

      expect(bubble.status).toBe("streaming");
      expect(bubble.getStatusIndicator()).toBe("🔄"); // Updated for better streaming indicator
    });

    it("should handle different status types", () => {
      const streamingBubble = new MessageBubble(createMockMessage({ status: "streaming" }));
      const completeBubble = new MessageBubble(createMockMessage({ status: "complete" }));
      const errorBubble = new MessageBubble(createMockMessage({ status: "error" }));

      expect(streamingBubble.getStatusIndicator()).toBe("🔄");
      expect(completeBubble.getStatusIndicator()).toBe("✅");
      expect(errorBubble.getStatusIndicator()).toBe("❌");
    });

    it("should provide animated dots for streaming status", () => {
      const bubble = new MessageBubble(createMockMessage({ status: "streaming" }));

      const dots1 = bubble.getAnimatedDots(0);
      const dots2 = bubble.getAnimatedDots(1);
      const dots3 = bubble.getAnimatedDots(2);

      expect([dots1, dots2, dots3]).toContain(".");
      expect([dots1, dots2, dots3]).toContain("..");
      expect([dots1, dots2, dots3]).toContain("...");
    });
  });

  describe("Metadata and Token Display", () => {
    it("should support metadata attachments", () => {
      const bubble = new MessageBubble(createMockMessage({
        role: "assistant",
        metadata: {
          model: "gpt-4",
          tokens: 150,
          toolCalls: ["search", "calculate"],
        }
      }));

      expect(bubble.metadata?.model).toBe("gpt-4");
      expect(bubble.metadata?.tokens).toBe(150);
      expect(bubble.metadata?.toolCalls).toContain("search");
    });

    it("should format metadata for display", () => {
      const bubble = new MessageBubble(createMockMessage({
        role: "assistant",
        metadata: {
          model: "gpt-4",
          tokens: 150,
        }
      }));

      const formattedMeta = bubble.getFormattedMetadata();
      expect(formattedMeta).toContain("gpt-4");
      expect(formattedMeta).toContain("150");
    });
  });

  describe("Performance and Accessibility", () => {
    it("should calculate bubble dimensions efficiently", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "Test content"
      }));

      const start = performance.now();
      bubble.calculateOptimalWidth(80);
      bubble.getBorderedContent(40);
      const end = performance.now();

      // Should render in less than 16ms for 60fps target
      expect(end - start).toBeLessThan(16);
    });

    it("should provide accessible text for screen readers", () => {
      const bubble = new MessageBubble(createMockMessage({
        role: "assistant",
        content: "Hello world",
        timestamp: new Date("2025-09-16T10:30:00")
      }));

      const accessibleText = bubble.getAccessibleText();
      expect(accessibleText).toContain("Assistant");
      expect(accessibleText).toContain("Hello world");
      expect(accessibleText).toContain("10:30");
    });

    it("should support high contrast mode", () => {
      const bubble = new MessageBubble(createMockMessage({ role: "user" }));

      const normalStyle = bubble.getBubbleStyle();
      const highContrastStyle = bubble.getBubbleStyle({ highContrast: true });

      expect(highContrastStyle.color).toBeDefined();
      expect(highContrastStyle.backgroundColor).toBeDefined();
      // High contrast should be different from normal
      expect(highContrastStyle.color !== normalStyle.color ||
             highContrastStyle.backgroundColor !== normalStyle.backgroundColor).toBe(true);
    });
  });
});

describe("Phase 2 Validation", () => {
  describe("Basic Message Rendering Complete", () => {
    it("should have all required basic rendering functionality", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "Test basic rendering",
        role: "user",
        timestamp: new Date(),
        metadata: { model: "test-model", tokens: 100 }
      }));

      // Task 2.1: Simple Message Display - All implemented ✅
      expect(bubble.getContentLines()).toBeDefined(); // Basic text rendering
      expect(bubble.getRoleIndicator()).toBeDefined(); // Role identification
      expect(bubble.getBubbleStyle().color).toBeDefined(); // Role-based styling
      expect(bubble.getWrappedContent(40)).toBeDefined(); // Word wrapping
      expect(bubble.getTruncatedContent(50)).toBeDefined(); // Text truncation

      // Task 2.2: Message Metadata Display - All implemented ✅
      expect(bubble.getFormattedTime()).toBeDefined(); // Timestamp formatting
      expect(bubble.getFormattedMetadata()).toBeDefined(); // Token count display
      expect(bubble.getBorderedContent(40)).toContain("User"); // Metadata positioning (via header)
    });

    it("should demonstrate full Phase 2 feature completeness", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "Phase 2 is complete with all required basic rendering features",
        role: "assistant",
        status: "complete",
        showAvatar: true,
        showTimestamp: true,
        metadata: {
          model: "gpt-4",
          tokens: 150,
          toolCalls: ["search", "analyze"]
        }
      }));

      const borderedContent = bubble.getBorderedContent(60);

      // Verify all Phase 2 components work together
      expect(borderedContent).toBeTruthy();
      expect(borderedContent.length).toBeGreaterThan(0);

      // All basic rendering features are present and functional
      expect(bubble.getRoleIndicator()).toBe("🤖");
      expect(bubble.getBubbleStyle().alignment).toBe("left");
      expect(bubble.getFormattedMetadata()).toContain("gpt-4");
      expect(bubble.getStatusIndicator()).toBe("✅");
    });
  });
});

describe("Phase 3: Content Type Support", () => {
  describe("Task 3.1: Tool Call Visualization", () => {
    it("should detect tool call blocks in message content", () => {
      const contentWithToolCall = `Here's a tool call:

{ "tool_call": { "server": "filesystem", "name": "read_file", "input": { "path": "/test.txt" } } }

And the result.`;

      const bubble = new MessageBubble(createMockMessage({
        content: contentWithToolCall
      }));

      expect(bubble.hasToolCalls()).toBe(true);
      const toolCalls = bubble.getToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].server).toBe("filesystem");
      expect(toolCalls[0].name).toBe("read_file");
    });

    it("should format JSON tool calls for terminal display", () => {
      const toolCallContent = `Tool execution:
{ "tool_call": { "server": "search", "name": "query", "input": { "q": "test", "limit": 10 } } }`;

      const bubble = new MessageBubble(createMockMessage({
        content: toolCallContent
      }));

      const formatted = bubble.getFormattedToolCalls();
      expect(formatted).toBeTruthy();
      expect(formatted).toContain("search");
      expect(formatted).toContain("query");
    });

    it("should create structured display for tool call arguments", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: '{ "tool_call": { "server": "api", "name": "request", "input": { "url": "https://example.com", "method": "GET" } } }'
      }));

      const toolCalls = bubble.getToolCalls();
      expect(toolCalls).toHaveLength(1);

      const structured = bubble.getStructuredToolCall(toolCalls[0]);
      expect(structured).toContain("Server: api");
      expect(structured).toContain("Tool: request");
      expect(structured).toContain("https://example.com");
    });

    it("should handle multiple tool calls in single message", () => {
      const multiToolContent = `First call:
{ "tool_call": { "server": "fs", "name": "read", "input": { "file": "a.txt" } } }

Second call:
{ "tool_call": { "server": "db", "name": "query", "input": { "table": "users" } } }`;

      const bubble = new MessageBubble(createMockMessage({
        content: multiToolContent
      }));

      expect(bubble.hasToolCalls()).toBe(true);
      const toolCalls = bubble.getToolCalls();
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].server).toBe("fs");
      expect(toolCalls[1].server).toBe("db");
    });

    it("should support collapsible tool call sections", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: '{ "tool_call": { "server": "test", "name": "action", "input": { "data": "large payload" } } }'
      }));

      const collapsed = bubble.getCollapsedToolCall(bubble.getToolCalls()[0]);
      const expanded = bubble.getExpandedToolCall(bubble.getToolCalls()[0]);

      expect(collapsed).toBeTruthy();
      expect(expanded).toBeTruthy();
      expect(collapsed.length).toBeLessThan(expanded.length);
    });
  });

  describe("Task 3.2: Enhanced Code Block Handling", () => {
    it("should detect code fence blocks with language specification", () => {
      const contentWithCode = `Here's some code:

\`\`\`javascript
function hello() {
  console.log("Hello, world!");
}
\`\`\`

And that's it.`;

      const bubble = new MessageBubble(createMockMessage({
        content: contentWithCode
      }));

      expect(bubble.hasCodeBlocks()).toBe(true);
      const codeBlocks = bubble.getCodeBlocks();
      expect(codeBlocks).toHaveLength(1);
      expect(codeBlocks[0].language).toBe("javascript");
      expect(codeBlocks[0].code).toContain("console.log");
    });

    it("should handle code blocks without language specification", () => {
      const contentWithGenericCode = `Generic code:

\`\`\`
const x = 42;
console.log(x);
\`\`\``;

      const bubble = new MessageBubble(createMockMessage({
        content: contentWithGenericCode
      }));

      const codeBlocks = bubble.getCodeBlocks();
      expect(codeBlocks).toHaveLength(1);
      expect(codeBlocks[0].language).toBe("plaintext");
      expect(codeBlocks[0].code).toBe("const x = 42;\nconsole.log(x);");
    });

    it("should create bordered code blocks with syntax highlighting", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "\`\`\`python\nprint('Hello')\n\`\`\`"
      }));

      const codeBlocks = bubble.getCodeBlocks();
      const formatted = bubble.getFormattedCodeBlock(codeBlocks[0]);

      expect(formatted).toBeTruthy();
      expect(formatted).toContain("PYTHON");
      expect(formatted).toContain("print");
    });

    it("should handle multiple code blocks in one message", () => {
      const multiCodeContent = `First block:

\`\`\`javascript
console.log("JS");
\`\`\`

Second block:

\`\`\`python
print("Python")
\`\`\``;

      const bubble = new MessageBubble(createMockMessage({
        content: multiCodeContent
      }));

      const codeBlocks = bubble.getCodeBlocks();
      expect(codeBlocks).toHaveLength(2);
      expect(codeBlocks[0].language).toBe("javascript");
      expect(codeBlocks[1].language).toBe("python");
    });

    it("should support syntax highlighting for different languages", () => {
      const languages = ["javascript", "python", "typescript", "bash", "json"];

      languages.forEach(lang => {
        const content = `\`\`\`${lang}\nconst test = "example";\n\`\`\``;
        const bubble = new MessageBubble(createMockMessage({ content }));

        const codeBlocks = bubble.getCodeBlocks();
        expect(codeBlocks[0].language).toBe(lang);

        const highlighted = bubble.getSyntaxHighlighted(codeBlocks[0]);
        expect(highlighted).toBeTruthy();
      });
    });

    it("should create copyable code content", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "\`\`\`javascript\nfunction test() { return 42; }\n\`\`\`"
      }));

      const codeBlocks = bubble.getCodeBlocks();
      const copyable = bubble.getCopyableCode(codeBlocks[0]);

      expect(copyable).toBe("function test() { return 42; }");
      expect(copyable).not.toContain("```");
    });
  });

  describe("Task 3.3: Markdown Support", () => {
    it("should render basic markdown formatting (bold, italic)", () => {
      const markdownContent = `This is **bold text** and *italic text*.
Also has __bold__ and _italic_ variants.`;

      const bubble = new MessageBubble(createMockMessage({
        content: markdownContent
      }));

      const rendered = bubble.renderMarkdown();
      expect(rendered).toBeTruthy();
      expect(rendered).toContain("bold text");
      expect(rendered).toContain("italic text");
    });

    it("should handle markdown links", () => {
      const linkContent = `Check out [Claude Code](https://claude.ai/code) and [GitHub](https://github.com).`;

      const bubble = new MessageBubble(createMockMessage({
        content: linkContent
      }));

      const rendered = bubble.renderMarkdown();
      expect(rendered).toContain("Claude Code");
      expect(rendered).toContain("https://claude.ai/code");
      expect(rendered).toContain("GitHub");
    });

    it("should format markdown lists", () => {
      const listContent = `Shopping list:
- Apples
- Bananas
- Oranges

Numbered list:
1. First item
2. Second item
3. Third item`;

      const bubble = new MessageBubble(createMockMessage({
        content: listContent
      }));

      const rendered = bubble.renderMarkdown();
      expect(rendered).toBeTruthy();
      expect(rendered).toContain("Apples");
      expect(rendered).toContain("First item");
    });

    it("should render markdown headers", () => {
      const headerContent = `# Main Header
## Sub Header
### Sub-sub Header`;

      const bubble = new MessageBubble(createMockMessage({
        content: headerContent
      }));

      const rendered = bubble.renderMarkdown();
      expect(rendered).toContain("Main Header");
      expect(rendered).toContain("Sub Header");
      expect(rendered).toContain("Sub-sub Header");
    });

    it("should detect and format markdown tables", () => {
      const tableContent = `| Name | Age | City |
|------|-----|------|
| John | 30  | NYC  |
| Jane | 25  | LA   |`;

      const bubble = new MessageBubble(createMockMessage({
        content: tableContent
      }));

      expect(bubble.hasMarkdownTables()).toBe(true);
      const tables = bubble.getMarkdownTables();
      expect(tables).toHaveLength(1);

      const formatted = bubble.formatMarkdownTable(tables[0]);
      expect(formatted).toContain("Name");
      expect(formatted).toContain("John");
    });

    it("should handle mixed markdown content with proper terminal width", () => {
      const mixedContent = `# Report
This is a **comprehensive** report.

## Code Example
\`\`\`javascript
console.log("test");
\`\`\`

## Links
- [Documentation](https://example.com)
- [Source](https://github.com)`;

      const bubble = new MessageBubble(createMockMessage({
        content: mixedContent
      }));

      const rendered = bubble.renderMarkdownForTerminal(60);
      expect(rendered).toBeTruthy();
      expect(rendered.length).toBeGreaterThan(0);
    });
  });
});

describe("Phase 4: Interactive Features", () => {
  describe("Task 4.1: Selection and Navigation", () => {
    it("should detect when message is focused for navigation", () => {
      const bubble = new MessageBubble(createMockMessage());
      expect(bubble.isFocused()).toBe(false);

      bubble.setFocused(true);
      expect(bubble.isFocused()).toBe(true);
    });

    it("should handle keyboard navigation between messages", () => {
      const bubble = new MessageBubble(createMockMessage());

      // Test navigation state tracking
      expect(bubble.canNavigateUp()).toBe(false); // First message
      expect(bubble.canNavigateDown()).toBe(true); // Has next messages

      bubble.setMessagePosition(1, 3); // Position 1 of 3 total messages
      expect(bubble.canNavigateUp()).toBe(true);
      expect(bubble.canNavigateDown()).toBe(true);

      bubble.setMessagePosition(2, 3); // Last message
      expect(bubble.canNavigateUp()).toBe(true);
      expect(bubble.canNavigateDown()).toBe(false);
    });

    it("should provide visual feedback for focused messages", () => {
      const bubble = new MessageBubble(createMockMessage());
      const defaultRender = bubble.render();

      bubble.setFocused(true);
      const focusedRender = bubble.render();

      expect(focusedRender).not.toBe(defaultRender);
      expect(focusedRender).toContain("▸"); // Focus indicator
    });

    it("should handle message selection highlighting", () => {
      const bubble = new MessageBubble(createMockMessage());
      expect(bubble.isSelected()).toBe(false);

      bubble.setSelected(true);
      expect(bubble.isSelected()).toBe(true);

      const selectedRender = bubble.render();
      expect(selectedRender).toContain("■"); // Selection indicator
    });

    it("should support page up/down navigation", () => {
      const bubble = new MessageBubble(createMockMessage());

      expect(bubble.getPageUpTarget(10)).toBe(0); // Jump to top
      expect(bubble.getPageDownTarget(10)).toBe(9); // Jump near bottom

      bubble.setMessagePosition(5, 20);
      expect(bubble.getPageUpTarget(10)).toBe(-5); // Move up 10 positions
      expect(bubble.getPageDownTarget(10)).toBe(15); // Move down 10 positions
    });

    it("should implement jump-to-message functionality", () => {
      const bubble = new MessageBubble(createMockMessage());

      expect(bubble.canJumpToMessage(5)).toBe(true);
      expect(bubble.canJumpToMessage(-1)).toBe(false);

      bubble.setMessageCount(10);
      expect(bubble.canJumpToMessage(15)).toBe(false); // Beyond range
      expect(bubble.canJumpToMessage(9)).toBe(true); // Valid range
    });

    it("should manage focus for accessibility", () => {
      const bubble = new MessageBubble(createMockMessage());

      // Test focus management
      expect(bubble.getFocusAriaLabel()).toBe("Message from user, Test message");

      bubble.setFocused(true);
      expect(bubble.getFocusAriaLabel()).toContain("focused");

      bubble.setSelected(true);
      expect(bubble.getFocusAriaLabel()).toContain("selected");
    });
  });

  describe("Task 4.2: Copy and Export Features", () => {
    it("should provide message content for clipboard copying", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "Hello world!"
      }));

      const copyableContent = bubble.getCopyableContent();
      expect(copyableContent).toContain("Hello world!");
      expect(copyableContent).toContain("User"); // Include role (capitalized)
    });

    it("should handle clipboard integration for different content types", () => {
      const toolCallContent = `Using the search tool:
{ "tool_call": { "server": "filesystem", "name": "search", "input": { "pattern": "test" } } }`;

      const bubble = new MessageBubble(createMockMessage({
        content: toolCallContent
      }));

      const copyableContent = bubble.getCopyableContent();
      expect(copyableContent).toContain("search tool");
      expect(copyableContent).toContain("filesystem");
    });

    it("should export message content in plain text format", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "This is a **bold** message with *italic* text."
      }));

      const plainText = bubble.exportAsPlainText();
      expect(plainText).toContain("This is a bold message with italic text.");
      expect(plainText).not.toContain("**");
      expect(plainText).not.toContain("*");
    });

    it("should export message content in markdown format", () => {
      const bubble = new MessageBubble(createMockMessage({
        content: "This is a **bold** message with *italic* text."
      }));

      const markdown = bubble.exportAsMarkdown();
      expect(markdown).toContain("**bold**");
      expect(markdown).toContain("*italic*");
      expect(markdown).toContain("# User Message");
    });

    it("should support bulk operations for multiple messages", () => {
      const bubble = new MessageBubble(createMockMessage());

      expect(bubble.isBulkSelected()).toBe(false);

      bubble.setBulkSelected(true);
      expect(bubble.isBulkSelected()).toBe(true);

      const bulkData = bubble.getBulkExportData();
      expect(bulkData).toHaveProperty("content");
      expect(bulkData).toHaveProperty("role");
      expect(bulkData).toHaveProperty("timestamp");
    });

    it("should implement context menu operations", () => {
      const bubble = new MessageBubble(createMockMessage());

      const contextMenuItems = bubble.getContextMenuItems();
      expect(contextMenuItems).toContain("Copy");
      expect(contextMenuItems).toContain("Export as Plain Text");
      expect(contextMenuItems).toContain("Export as Markdown");
      expect(contextMenuItems).toContain("Select for Bulk Operation");
    });
  });

  describe("Phase 5: Performance & Optimization", () => {
    describe("Task 5.1: Virtual Scrolling Implementation", () => {
      it("should support virtual scrolling with viewport detection", () => {
        const bubble = new MessageBubble(createMockMessage());

        // Initially not in viewport
        expect(bubble.isInViewport()).toBe(false);

        // Set viewport bounds
        bubble.setViewport({ top: 100, bottom: 500 });
        bubble.setPosition({ y: 200, height: 50 });

        // Now should be in viewport
        expect(bubble.isInViewport()).toBe(true);
      });

      it("should handle large conversation rendering efficiently", () => {
        const bubble = new MessageBubble(createMockMessage({
          content: "A".repeat(10000) // Very long message
        }));

        // Should only render if in viewport
        bubble.setViewport({ top: 0, bottom: 1000 });
        bubble.setPosition({ y: 2000, height: 100 });

        expect(bubble.shouldRender()).toBe(false);
        expect(bubble.isInViewport()).toBe(false);
      });

      it("should calculate and cache message heights efficiently", () => {
        const bubble = new MessageBubble(createMockMessage());

        // First calculation
        const height1 = bubble.calculateHeight(80); // Terminal width
        expect(height1).toBeGreaterThan(0);

        // Second call should use cache
        const height2 = bubble.calculateHeight(80);
        expect(height2).toBe(height1);

        // Different width should recalculate
        const height3 = bubble.calculateHeight(60);
        expect(height3).toBeGreaterThanOrEqual(height1);
      });

      it("should support smooth scrolling animations", () => {
        const bubble = new MessageBubble(createMockMessage());

        expect(bubble.isAnimating()).toBe(false);

        // Start scroll animation
        bubble.startScrollAnimation({ duration: 300, easing: 'ease-out' });
        expect(bubble.isAnimating()).toBe(true);

        // Stop animation
        bubble.stopScrollAnimation();
        expect(bubble.isAnimating()).toBe(false);
      });

      it("should optimize render performance for virtual list", () => {
        const bubble = new MessageBubble(createMockMessage());

        // Set as virtual item
        bubble.setVirtualIndex(42);
        expect(bubble.getVirtualIndex()).toBe(42);

        // Should track render state
        expect(bubble.hasRendered()).toBe(false);
        bubble.markRendered();
        expect(bubble.hasRendered()).toBe(true);
      });

      it("should handle viewport edge cases correctly", () => {
        const bubble = new MessageBubble(createMockMessage());

        // Partially visible at top
        bubble.setViewport({ top: 100, bottom: 500 });
        bubble.setPosition({ y: 80, height: 50 });
        expect(bubble.isPartiallyVisible()).toBe(true);

        // Partially visible at bottom
        bubble.setPosition({ y: 480, height: 50 });
        expect(bubble.isPartiallyVisible()).toBe(true);

        // Fully visible
        bubble.setPosition({ y: 200, height: 50 });
        expect(bubble.isFullyVisible()).toBe(true);
      });
    });

    describe("Task 5.2: Memory Management", () => {
      it("should support message cleanup and garbage collection", () => {
        const bubble = new MessageBubble(createMockMessage());

        // Track memory usage
        expect(bubble.getMemoryUsage()).toBeGreaterThan(0);

        // Cleanup resources
        bubble.cleanup();
        expect(bubble.isCleanedUp()).toBe(true);
      });

      it("should handle conversation compaction", () => {
        const bubble = new MessageBubble(createMockMessage({
          content: "A very long message that should be compacted"
        }));

        // Compact mode for memory savings
        bubble.setCompactMode(true);
        expect(bubble.isCompactMode()).toBe(true);

        // Should reduce memory footprint
        const normalMemory = bubble.getMemoryUsage();
        bubble.compact();
        expect(bubble.getMemoryUsage()).toBeLessThan(normalMemory);
      });

      it("should implement efficient message storage and retrieval", () => {
        const bubble = new MessageBubble(createMockMessage());

        // Cache frequently accessed data
        const cachedContent = bubble.getCachedContent();
        expect(cachedContent).toBeDefined();

        // Clear cache when needed
        bubble.clearCache();
        expect(bubble.isCacheEmpty()).toBe(true);
      });

      it("should support automatic cleanup of old conversation data", () => {
        const bubble = new MessageBubble(createMockMessage());

        // Set age threshold
        bubble.setAgeThreshold(3600000); // 1 hour in ms

        // Mark as old
        bubble.markAsOld();
        expect(bubble.isOld()).toBe(true);
        expect(bubble.shouldAutoCleanup()).toBe(true);
      });

      it("should enforce configurable conversation size limits", () => {
        const bubble = new MessageBubble(createMockMessage());

        // Set memory limit
        bubble.setMemoryLimit(1024 * 1024); // 1MB

        // Check if within limits
        expect(bubble.isWithinMemoryLimit()).toBe(true);

        // Simulate exceeding limit
        bubble.simulateMemoryPressure(2 * 1024 * 1024);
        expect(bubble.isWithinMemoryLimit()).toBe(false);
      });

      it("should implement lazy loading for conversation history", () => {
        const bubble = new MessageBubble(createMockMessage());

        // Initially not loaded
        expect(bubble.isFullyLoaded()).toBe(false);

        // Lazy load on demand
        bubble.lazyLoad();
        expect(bubble.isFullyLoaded()).toBe(true);

        // Can unload to save memory
        bubble.unload();
        expect(bubble.isFullyLoaded()).toBe(false);
      });
    });
  });

  // Phase 6: Accessibility & Polish
  describe("Phase 6: Accessibility & Polish", () => {
    describe("Task 6.1: Accessibility Features", () => {
      it("should provide ARIA labels for screen readers", () => {
        const bubble = new MessageBubble(createMockMessage());
        const ariaLabel = bubble.getAriaLabel();
        expect(ariaLabel).toContain("user");
        expect(ariaLabel).toContain("Test message");
        expect(ariaLabel).toContain("10:30 AM");
      });

      it("should support keyboard navigation", () => {
        const bubble = new MessageBubble(createMockMessage());
        const mockCallback = jest.fn();
        bubble.onKeyPress = mockCallback;

        bubble.handleKeyPress("Enter");
        expect(mockCallback).toHaveBeenCalledWith("Enter");

        bubble.handleKeyPress("Space");
        expect(mockCallback).toHaveBeenCalledWith("Space");
      });

      it("should provide focus indicators", () => {
        const bubble = new MessageBubble(createMockMessage());
        expect(bubble.isFocused()).toBe(false);

        bubble.setFocused(true);
        expect(bubble.isFocused()).toBe(true);
        expect(bubble.getFocusStyle()).toBeDefined();
      });

      it("should announce state changes to screen readers", () => {
        const bubble = new MessageBubble(createMockMessage());
        const announcements: string[] = [];
        bubble.onAnnounce = (text) => announcements.push(text);

        bubble.setSelected(true);
        expect(announcements).toContain("Message selected");

        bubble.setExpanded(false);
        expect(announcements).toContain("Message collapsed");
      });

      it("should support high contrast mode", () => {
        const bubble = new MessageBubble(createMockMessage());
        bubble.setHighContrastMode(true);

        const style = bubble.getStyle();
        expect(style.borderStyle).toBe("double");
        expect(style.contrast).toBe("high");
      });

      it("should provide keyboard shortcuts documentation", () => {
        const bubble = new MessageBubble(createMockMessage());
        const shortcuts = bubble.getKeyboardShortcuts();

        expect(shortcuts).toContainEqual({
          key: "Enter",
          action: "Select/Activate message"
        });
        expect(shortcuts).toContainEqual({
          key: "Space",
          action: "Toggle expanded state"
        });
        expect(shortcuts).toContainEqual({
          key: "c",
          action: "Copy message content"
        });
      });
    });

    describe("Task 6.2: Visual Polish & Theming", () => {
      it("should support theme switching", () => {
        const bubble = new MessageBubble(createMockMessage());

        bubble.setTheme("dark");
        expect(bubble.getTheme()).toBe("dark");

        bubble.setTheme("light");
        expect(bubble.getTheme()).toBe("light");

        bubble.setTheme("high-contrast");
        expect(bubble.getTheme()).toBe("high-contrast");
      });

      it("should apply theme-specific colors", () => {
        const bubble = new MessageBubble(createMockMessage());

        bubble.setTheme("dark");
        const darkStyle = bubble.getStyle();
        expect(darkStyle.backgroundColor).toBeDefined();
        expect(darkStyle.textColor).toBeDefined();

        bubble.setTheme("light");
        const lightStyle = bubble.getStyle();
        expect(lightStyle.backgroundColor).not.toBe(darkStyle.backgroundColor);
      });

      it("should support customizable color schemes", () => {
        const bubble = new MessageBubble(createMockMessage());
        const customTheme = {
          name: "custom",
          colors: {
            background: "#1a1a1a",
            text: "#ffffff",
            border: "#444444"
          }
        };

        bubble.setCustomTheme(customTheme);
        const style = bubble.getStyle();
        expect(style.backgroundColor).toBe("#1a1a1a");
        expect(style.textColor).toBe("#ffffff");
        expect(style.borderColor).toBe("#444444");
      });

      it("should handle responsive design for different terminal sizes", () => {
        const bubble = new MessageBubble(createMockMessage());

        // Small terminal
        bubble.setTerminalSize(40, 20);
        expect(bubble.getResponsiveLayout()).toBe("compact");

        // Medium terminal
        bubble.setTerminalSize(80, 24);
        expect(bubble.getResponsiveLayout()).toBe("standard");

        // Large terminal
        bubble.setTerminalSize(120, 40);
        expect(bubble.getResponsiveLayout()).toBe("expanded");
      });

      it("should implement smooth transitions", () => {
        const bubble = new MessageBubble(createMockMessage());

        bubble.enableTransitions();
        expect(bubble.hasTransitions()).toBe(true);

        const transition = bubble.getTransition("expand");
        expect(transition.duration).toBe(200);
        expect(transition.easing).toBe("ease-in-out");
      });

      it("should provide animation controls", () => {
        const bubble = new MessageBubble(createMockMessage());

        bubble.enableAnimations();
        expect(bubble.hasAnimations()).toBe(true);

        // Can disable for performance
        bubble.disableAnimations();
        expect(bubble.hasAnimations()).toBe(false);

        // Reduced motion support
        bubble.setReducedMotion(true);
        expect(bubble.hasAnimations()).toBe(false);
      });
    });
  });
});