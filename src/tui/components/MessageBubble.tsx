import boxen from "boxen";
import stripAnsi from "strip-ansi";

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "complete" | "error" | "pending";

export interface MessageMetadata {
  model?: string;
  tokens?: number;
  toolCalls?: string[];
  [key: string]: any;
}

export interface MessageBubbleProps {
  role: MessageRole;
  content: string;
  timestamp: Date;
  status?: MessageStatus;
  metadata?: MessageMetadata;
  maxWidth?: number;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  theme?: BubbleTheme;
}

export interface CodeBlock {
  language: string;
  code: string;
  startLine?: number;
  endLine?: number;
}

export interface ToolCall {
  server: string;
  name: string;
  input: Record<string, any>;
}

export interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

export interface BubbleStyle {
  color: string;
  backgroundColor?: string;
  alignment: "left" | "right" | "center";
  borderColor?: string;
}

export interface BubbleTheme {
  highContrast?: boolean;
  colors?: {
    user?: string;
    assistant?: string;
    system?: string;
  };
}

export class MessageBubble {
  public role: MessageRole;
  public content: string;
  public timestamp: Date;
  public status?: MessageStatus;
  public metadata?: MessageMetadata;
  public maxWidth?: number;
  public showAvatar?: boolean;
  public showTimestamp?: boolean;
  public theme?: BubbleTheme;

  constructor(props: MessageBubbleProps) {
    this.role = props.role;
    this.content = props.content;
    this.timestamp = props.timestamp;
    this.status = props.status;
    this.metadata = props.metadata;
    this.maxWidth = props.maxWidth;
    this.showAvatar = props.showAvatar ?? true;
    this.showTimestamp = props.showTimestamp ?? true;
    this.theme = props.theme;
  }

  // Enhanced role indicators with emoji fallback support
  getRoleIndicator(): string {
    switch (this.role) {
      case "user":
        return "👤";
      case "assistant":
        return "🤖";
      case "system":
        return "⚙️";
    }
  }

  getFallbackIndicator(): string {
    switch (this.role) {
      case "user":
        return "[U]";
      case "assistant":
        return "[A]";
      case "system":
        return "[S]";
    }
  }

  getRoleColor(): string {
    const colors = this.theme?.colors;
    switch (this.role) {
      case "user":
        return colors?.user || "blue";
      case "assistant":
        return colors?.assistant || "green";
      case "system":
        return colors?.system || "yellow";
    }
  }

  // Enhanced styling with theme support
  getBubbleStyle(options: { highContrast?: boolean } = {}): BubbleStyle {
    const isHighContrast = options.highContrast || this.theme?.highContrast;

    switch (this.role) {
      case "user":
        return {
          color: isHighContrast ? "white" : "blue",
          backgroundColor: isHighContrast ? "blue" : undefined,
          alignment: "right",
          borderColor: isHighContrast ? "white" : "blue",
        };
      case "assistant":
        return {
          color: isHighContrast ? "white" : "green",
          backgroundColor: isHighContrast ? "green" : undefined,
          alignment: "left",
          borderColor: isHighContrast ? "white" : "green",
        };
      case "system":
        return {
          color: isHighContrast ? "white" : "yellow",
          backgroundColor: isHighContrast ? "yellow" : undefined,
          alignment: "center",
          borderColor: isHighContrast ? "white" : "yellow",
        };
    }
  }

  // Time formatting methods
  getFormattedTime(): string {
    const hours = this.timestamp.getHours().toString().padStart(2, "0");
    const minutes = this.timestamp.getMinutes().toString().padStart(2, "0");
    const seconds = this.timestamp.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  getRelativeTime(): string {
    const now = new Date();
    const diff = now.getTime() - this.timestamp.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 0) return `${seconds}s ago`;
    return "just now";
  }

  // Content processing methods
  getContentLines(): string[] {
    return this.content.split("\n");
  }

  getTruncatedContent(maxLength: number): string {
    if (this.content.length <= maxLength) {
      return this.content;
    }
    return this.content.substring(0, maxLength) + "...";
  }

  // Enhanced word wrapping for bubble boundaries
  getWrappedContent(width: number): string[] {
    const lines = this.getContentLines();
    const wrappedLines: string[] = [];
    const maxLineWidth = width - 4; // Account for borders and padding

    for (const line of lines) {
      const cleanLine = stripAnsi(line) || line;
      if (cleanLine.length <= maxLineWidth) {
        wrappedLines.push(line);
      } else {
        // Word wrap long lines
        const words = line.split(" ");
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;

          const cleanTestLine = stripAnsi(testLine) || testLine;
          if (cleanTestLine.length <= maxLineWidth) {
            currentLine = testLine;
          } else {
            if (currentLine) {
              wrappedLines.push(currentLine);
              currentLine = word;
            } else {
              // Handle very long words by breaking them
              wrappedLines.push(word.substring(0, maxLineWidth));
              currentLine = word.substring(maxLineWidth);
            }
          }
        }

        if (currentLine) {
          wrappedLines.push(currentLine);
        }
      }
    }

    return wrappedLines;
  }

  // Calculate optimal width for bubble
  calculateOptimalWidth(terminalWidth: number): number {
    const minWidth = 20;
    const maxWidth = Math.min(terminalWidth - 4, this.maxWidth || 80);

    const contentLines = this.getContentLines();
    const longestLine = Math.max(
      ...contentLines.map(line => (stripAnsi(line) || line).length)
    );

    const optimalWidth = Math.max(
      minWidth,
      Math.min(longestLine + 6, maxWidth) // 6 for borders and padding
    );

    return optimalWidth;
  }

  // Enhanced bordered content with Unicode box-drawing characters
  getBorderedContent(width: number): string {
    const wrappedLines = this.getWrappedContent(width);
    const style = this.getBubbleStyle();

    const borderOptions = {
      borderStyle: "round" as const,
      borderColor: style.borderColor || style.color,
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: 0,
      width: width - 2,
    };

    // Create header with role indicator and timestamp
    const header = this.createBubbleHeader();
    const content = wrappedLines.join("\n");
    const fullContent = header ? `${header}\n${content}` : content;

    const result = boxen(fullContent, borderOptions);
    return result || fullContent; // Fallback if boxen fails
  }

  private createBubbleHeader(): string {
    const parts: string[] = [];

    if (this.showAvatar) {
      parts.push(this.getRoleIndicator());
    }

    parts.push(this.role.charAt(0).toUpperCase() + this.role.slice(1));

    if (this.showTimestamp) {
      parts.push("·");
      parts.push(this.getFormattedTime());
    }

    if (this.status) {
      parts.push(this.getStatusIndicator());
    }

    return parts.join(" ");
  }

  // Code block detection and processing
  hasCodeBlocks(): boolean {
    return this.content.includes("```");
  }

  getCodeBlocks(): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(this.content)) !== null) {
      blocks.push({
        language: match[1] || "plaintext",
        code: match[2].trim(),
      });
    }

    return blocks;
  }

  // Tool call detection and processing
  hasToolCalls(): boolean {
    return this.content.includes('"tool_call"');
  }

  getToolCalls(): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Try line-by-line approach for simpler parsing
    const lines = this.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.includes('"tool_call"')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.tool_call && parsed.tool_call.server && parsed.tool_call.name) {
            toolCalls.push({
              server: parsed.tool_call.server,
              name: parsed.tool_call.name,
              input: parsed.tool_call.input || {},
            });
          }
        } catch (e) {
          // Continue trying other lines
        }
      }
    }

    return toolCalls;
  }

  getFormattedToolCalls(): string {
    const toolCalls = this.getToolCalls();
    if (toolCalls.length === 0) return "";

    return toolCalls.map(call =>
      `🔧 ${call.server}/${call.name}: ${JSON.stringify(call.input, null, 2)}`
    ).join("\n\n");
  }

  getStructuredToolCall(toolCall: ToolCall): string {
    const lines = [
      `🔧 Tool Call`,
      `Server: ${toolCall.server}`,
      `Tool: ${toolCall.name}`,
      `Arguments:`,
    ];

    for (const [key, value] of Object.entries(toolCall.input)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }

    return lines.join("\n");
  }

  getCollapsedToolCall(toolCall: ToolCall): string {
    return `🔧 ${toolCall.server}/${toolCall.name} [...]`;
  }

  getExpandedToolCall(toolCall: ToolCall): string {
    return this.getStructuredToolCall(toolCall);
  }

  // Enhanced code block handling
  getFormattedCodeBlock(codeBlock: CodeBlock): string {
    const header = `📝 ${codeBlock.language.toUpperCase()}`;
    const separator = "─".repeat(Math.max(20, codeBlock.language.length + 4));

    return [
      `┌─${separator}─┐`,
      `│ ${header.padEnd(separator.length)} │`,
      `├─${separator}─┤`,
      ...codeBlock.code.split('\n').map(line =>
        `│ ${line.padEnd(separator.length)} │`
      ),
      `└─${separator}─┘`
    ].join('\n');
  }

  getSyntaxHighlighted(codeBlock: CodeBlock): string {
    // Basic syntax highlighting using color codes for terminal
    const { language, code } = codeBlock;

    if (language === "javascript" || language === "typescript") {
      return code
        .replace(/\b(function|const|let|var|if|else|for|while|return)\b/g, '\x1b[34m$1\x1b[0m') // Keywords in blue
        .replace(/("[^"]*")/g, '\x1b[32m$1\x1b[0m') // Strings in green
        .replace(/\b(\d+)\b/g, '\x1b[33m$1\x1b[0m'); // Numbers in yellow
    }

    if (language === "python") {
      return code
        .replace(/\b(def|class|if|else|elif|for|while|return|import|from)\b/g, '\x1b[34m$1\x1b[0m')
        .replace(/("[^"]*")/g, '\x1b[32m$1\x1b[0m')
        .replace(/\b(\d+)\b/g, '\x1b[33m$1\x1b[0m');
    }

    if (language === "json") {
      return code
        .replace(/("[^"]*"):/g, '\x1b[36m$1\x1b[0m:') // Keys in cyan
        .replace(/:\s*("[^"]*")/g, ': \x1b[32m$1\x1b[0m') // String values in green
        .replace(/:\s*(\d+)/g, ': \x1b[33m$1\x1b[0m'); // Number values in yellow
    }

    return code; // Return unstyled for unsupported languages
  }

  getCopyableCode(codeBlock: CodeBlock): string {
    return codeBlock.code;
  }

  // Markdown support
  renderMarkdown(): string {
    let content = this.content;

    // Handle headers
    content = content.replace(/^### (.*$)/gm, '\x1b[1m\x1b[33m▸ $1\x1b[0m'); // H3 - Yellow
    content = content.replace(/^## (.*$)/gm, '\x1b[1m\x1b[36m▸▸ $1\x1b[0m'); // H2 - Cyan
    content = content.replace(/^# (.*$)/gm, '\x1b[1m\x1b[35m▸▸▸ $1\x1b[0m'); // H1 - Magenta

    // Handle bold and italic
    content = content.replace(/\*\*(.*?)\*\*/g, '\x1b[1m$1\x1b[0m'); // **bold**
    content = content.replace(/__(.*?)__/g, '\x1b[1m$1\x1b[0m'); // __bold__
    content = content.replace(/\*(.*?)\*/g, '\x1b[3m$1\x1b[0m'); // *italic*
    content = content.replace(/_(.*?)_/g, '\x1b[3m$1\x1b[0m'); // _italic_

    // Handle links
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '\x1b[34m$1\x1b[0m (\x1b[90m$2\x1b[0m)');

    // Handle lists
    content = content.replace(/^- (.*$)/gm, '  • $1'); // Bullet lists
    content = content.replace(/^\d+\. (.*$)/gm, (match, text, offset, string) => {
      const lineStart = string.lastIndexOf('\n', offset) + 1;
      const lineNumber = string.substring(lineStart, offset).match(/^\d+/)?.[0] || '1';
      return `  ${lineNumber}. ${text}`;
    }); // Numbered lists

    return content;
  }

  hasMarkdownTables(): boolean {
    return this.content.includes('|') && this.content.includes('---');
  }

  getMarkdownTables(): MarkdownTable[] {
    const tables: MarkdownTable[] = [];
    const lines = this.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
        // Found a table header
        const headers = line.split('|').map(h => h.trim()).filter(h => h.length > 0);
        const rows: string[][] = [];

        // Skip the separator line
        i += 2;

        // Collect table rows
        while (i < lines.length && lines[i].includes('|')) {
          const row = lines[i].split('|').map(c => c.trim()).filter(c => c.length > 0);
          if (row.length > 0) {
            rows.push(row);
          }
          i++;
        }

        if (headers.length > 0 && rows.length > 0) {
          tables.push({ headers, rows });
        }
        i--; // Adjust for the outer loop increment
      }
    }

    return tables;
  }

  formatMarkdownTable(table: MarkdownTable): string {
    const { headers, rows } = table;

    // Calculate column widths
    const colWidths = headers.map((header, i) => {
      const maxRowWidth = Math.max(...rows.map(row => (row[i] || '').length));
      return Math.max(header.length, maxRowWidth);
    });

    // Create table
    const separator = '─';
    const corner = '┼';
    const topLeft = '┌';
    const topRight = '┐';
    const bottomLeft = '└';
    const bottomRight = '┘';
    const vertical = '│';

    const topBorder = topLeft + colWidths.map(w => separator.repeat(w + 2)).join(corner) + topRight;
    const middleBorder = '├' + colWidths.map(w => separator.repeat(w + 2)).join(corner) + '┤';
    const bottomBorder = bottomLeft + colWidths.map(w => separator.repeat(w + 2)).join(corner) + bottomRight;

    const formatRow = (cells: string[]) =>
      vertical + cells.map((cell, i) => ` ${(cell || '').padEnd(colWidths[i])} `).join(vertical) + vertical;

    const lines = [
      topBorder,
      formatRow(headers),
      middleBorder,
      ...rows.map(row => formatRow(row)),
      bottomBorder
    ];

    return lines.join('\n');
  }

  renderMarkdownForTerminal(terminalWidth: number): string {
    const rendered = this.renderMarkdown();
    const lines = rendered.split('\n');
    const maxWidth = terminalWidth - 6; // Account for borders and padding

    return lines.map(line => {
      const cleanLine = stripAnsi(line) || line;
      if (cleanLine.length <= maxWidth) {
        return line;
      }
      // Simple word wrap for long lines
      const words = line.split(' ');
      const wrappedLines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const cleanTestLine = stripAnsi(testLine) || testLine;
        if (cleanTestLine.length <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            wrappedLines.push(currentLine);
            currentLine = word;
          } else {
            wrappedLines.push(word);
          }
        }
      }
      if (currentLine) {
        wrappedLines.push(currentLine);
      }
      return wrappedLines.join('\n');
    }).join('\n');
  }

  // Enhanced status indicators with animation support
  getStatusIndicator(): string {
    switch (this.status) {
      case "streaming":
        return "🔄";
      case "complete":
        return "✅";
      case "error":
        return "❌";
      case "pending":
        return "⏸️";
      default:
        return "";
    }
  }

  getAnimatedDots(frame: number): string {
    const patterns = [".", "..", "..."];
    return patterns[frame % patterns.length];
  }

  // Metadata formatting
  getFormattedMetadata(): string {
    if (!this.metadata) return "";

    const parts: string[] = [];

    if (this.metadata.model) {
      parts.push(`Model: ${this.metadata.model}`);
    }
    if (this.metadata.tokens) {
      parts.push(`Tokens: ${this.metadata.tokens}`);
    }
    if (this.metadata.toolCalls && this.metadata.toolCalls.length > 0) {
      parts.push(`Tools: ${this.metadata.toolCalls.join(", ")}`);
    }

    return parts.join(" | ");
  }

  // Accessibility support
  getAccessibleText(): string {
    const roleName = this.role.charAt(0).toUpperCase() + this.role.slice(1);
    const time = this.getFormattedTime();
    const statusText = this.status ? ` (${this.status})` : "";

    return `${roleName} message at ${time}${statusText}: ${this.content}`;
  }
}

// React Component Integration - Deferred to Phase 3 due to Jest/Ink configuration complexity
export const MessageBubbleComponent = undefined;