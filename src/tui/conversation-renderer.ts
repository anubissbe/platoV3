/**
 * ConversationRenderer - Manages rendering and scrolling of conversation history
 * Provides smooth scrolling, viewport management, and performance optimization
 */

import { EventEmitter } from 'events';

// Message interface
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    duration?: number;
  };
}

// Render configuration
export interface RenderConfig {
  maxLinesVisible: number;
  enableSyntaxHighlighting: boolean;
  enableWordWrap: boolean;
  indentSize: number;
  showTimestamps: boolean;
  smoothScrolling: boolean;
  showBoundaryIndicators: boolean;
}

// Viewport state
export interface ViewportState {
  scrollPosition: number;
  viewportHeight: number;
  totalHeight: number;
  visibleStartLine: number;
  visibleEndLine: number;
  horizontalScrollPosition: number;
  viewportWidth: number;
  totalWidth: number;
  visibleStartColumn: number;
  visibleEndColumn: number;
}

/**
 * ConversationRenderer class - manages conversation display and scrolling
 */
export class ConversationRenderer extends EventEmitter {
  private messages: ConversationMessage[] = [];
  private config: RenderConfig;
  private viewportState: ViewportState;
  private renderedLines: string[] = [];
  private scrollAnimation?: NodeJS.Timeout;
  private smoothScrollTarget: number = 0;
  private smoothScrollCurrent: number = 0;
  private smoothScrollDuration: number = 150;

  constructor(config: Partial<RenderConfig> = {}) {
    super();
    
    this.config = {
      maxLinesVisible: 25,
      enableSyntaxHighlighting: true,
      enableWordWrap: true,
      indentSize: 2,
      showTimestamps: false,
      smoothScrolling: true,
      showBoundaryIndicators: true,
      ...config,
    };

    this.viewportState = {
      scrollPosition: 0,
      viewportHeight: this.config.maxLinesVisible,
      totalHeight: 0,
      visibleStartLine: 0,
      visibleEndLine: 0,
      horizontalScrollPosition: 0,
      viewportWidth: process.stdout.columns || 80,
      totalWidth: 0,
      visibleStartColumn: 0,
      visibleEndColumn: 0,
    };
  }

  /**
   * Add a message to the conversation
   */
  addMessage(message: ConversationMessage): void {
    this.messages.push(message);
    this.renderMessages();
    this.updateViewport();
    
    // Auto-scroll to bottom for new messages
    this.scrollToBottom(true);
  }

  /**
   * Get all messages
   */
  getMessages(): ConversationMessage[] {
    return [...this.messages];
  }

  /**
   * Get message at specific index
   */
  getMessageAt(index: number): ConversationMessage | null {
    return this.messages[index] || null;
  }

  /**
   * Get conversation count
   */
  getConversationCount(): number {
    return this.messages.length;
  }

  /**
   * Set messages (replace all)
   */
  setMessages(messages: ConversationMessage[]): void {
    this.messages = [...messages];
    this.renderMessages();
    this.updateViewport();
    this.emit('messagesChanged', this.messages);
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
    this.renderedLines = [];
    this.viewportState.totalHeight = 0;
    this.setScrollPosition({ position: 0, smooth: false });
    this.emit('messagesCleared');
  }

  /**
   * Render messages to text lines
   */
  private renderMessages(): void {
    this.renderedLines = [];

    for (let i = 0; i < this.messages.length; i++) {
      const message = this.messages[i];
      const lines = this.renderMessage(message, i);
      this.renderedLines.push(...lines);
      
      // Add separator between messages (except last)
      if (i < this.messages.length - 1) {
        this.renderedLines.push(''); // Empty line separator
      }
    }

    this.viewportState.totalHeight = this.renderedLines.length;
  }

  /**
   * Render a single message to lines
   */
  private renderMessage(message: ConversationMessage, index: number): string[] {
    const lines: string[] = [];
    
    // Message header
    const roleIndicator = message.role === 'user' ? '👤' : '🤖';
    const timestamp = this.config.showTimestamps 
      ? ` (${new Date(message.timestamp).toLocaleTimeString()})`
      : '';
    
    lines.push(`${roleIndicator} ${message.role.toUpperCase()}${timestamp}`);
    lines.push('─'.repeat(50)); // Separator line

    // Message content with optimized word wrap for long responses
    const contentLines = this.wrapLongText(message.content, this.getContentWidth());
    lines.push(...contentLines);

    // Metadata (if available)
    if (message.metadata) {
      lines.push(''); // Empty line before metadata
      const metadataLine = this.renderMetadata(message.metadata);
      if (metadataLine) {
        lines.push(metadataLine);
      }
    }

    return lines;
  }

  /**
   * Wrap text to fit viewport width
   */
  private wrapText(text: string, maxWidth: number): string[] {
    if (!this.config.enableWordWrap) {
      return text.split('\n');
    }

    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxWidth) {
        lines.push(paragraph);
        continue;
      }

      // Word wrap long paragraphs
      const words = paragraph.split(' ');
      let currentLine = '';

      for (const word of words) {
        if (currentLine.length + word.length + 1 <= maxWidth) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) {
            lines.push(currentLine);
          }
          currentLine = word;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  /**
   * Get content width for text wrapping
   */
  private getContentWidth(): number {
    // Use terminal width if available, otherwise default to 80
    const terminalWidth = process.stdout.columns || 80;
    // Reserve space for padding, indicators, and margins
    return Math.max(40, terminalWidth - this.config.indentSize * 2 - 4);
  }

  /**
   * Optimize text wrapping for long AI responses
   */
  private wrapLongText(text: string, maxWidth: number): string[] {
    if (!this.config.enableWordWrap) {
      return text.split('\n');
    }

    const lines: string[] = [];
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxWidth) {
        lines.push(paragraph);
        continue;
      }

      // Enhanced word wrapping for long responses
      // Handle code blocks and special formatting
      if (paragraph.startsWith('```') || 
          paragraph.startsWith('    ') || 
          paragraph.includes('function ') ||
          paragraph.includes('const ') ||
          paragraph.includes('return ') ||
          paragraph.trim().startsWith('//') ||
          paragraph.trim().startsWith('*') ||
          (paragraph.includes('=') && paragraph.includes(';'))) {
        // Don't wrap code blocks and code-like content
        lines.push(paragraph);
        continue;
      }

      // Smart word wrapping with improved break points
      const words = paragraph.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        
        if (testLine.length <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
          }
          
          // Handle very long words
          if (word.length > maxWidth) {
            // Break long words at reasonable points
            let remainingWord = word;
            while (remainingWord.length > maxWidth) {
              lines.push(remainingWord.substring(0, maxWidth - 1) + '-');
              remainingWord = remainingWord.substring(maxWidth - 1);
            }
            currentLine = remainingWord;
          } else {
            currentLine = word;
          }
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  /**
   * Render metadata line
   */
  private renderMetadata(metadata: ConversationMessage['metadata']): string | null {
    if (!metadata) return null;

    const parts: string[] = [];
    
    if (metadata.tokensUsed) {
      parts.push(`${metadata.tokensUsed} tokens`);
    }
    
    if (metadata.model) {
      parts.push(`model: ${metadata.model}`);
    }
    
    if (metadata.duration) {
      parts.push(`${metadata.duration}ms`);
    }

    return parts.length > 0 ? `📊 ${parts.join(' • ')}` : null;
  }

  /**
   * Update viewport calculations
   */
  private updateViewport(): void {
    const { scrollPosition, viewportHeight, totalHeight, horizontalScrollPosition, viewportWidth } = this.viewportState;
    
    // Vertical viewport
    this.viewportState.visibleStartLine = Math.floor(scrollPosition);
    this.viewportState.visibleEndLine = Math.min(
      totalHeight - 1,
      Math.floor(scrollPosition + viewportHeight - 1)
    );
    
    // Horizontal viewport
    this.viewportState.visibleStartColumn = Math.floor(horizontalScrollPosition);
    this.viewportState.visibleEndColumn = Math.min(
      this.viewportState.totalWidth - 1,
      Math.floor(horizontalScrollPosition + viewportWidth - 1)
    );
    
    // Update max width from rendered lines
    this.updateMaxWidth();

    this.emit('viewportChanged', this.viewportState);
  }
  
  /**
   * Update maximum line width
   */
  private updateMaxWidth(): void {
    let maxWidth = 0;
    for (const line of this.renderedLines) {
      maxWidth = Math.max(maxWidth, line.length);
    }
    this.viewportState.totalWidth = maxWidth;
  }

  /**
   * Get viewport height
   */
  getViewportHeight(): number {
    return this.viewportState.viewportHeight;
  }

  /**
   * Set viewport height
   */
  setViewportHeight(height: number): void {
    this.viewportState.viewportHeight = height;
    this.updateViewport();
  }

  /**
   * Get total content height
   */
  getTotalHeight(): number {
    return this.viewportState.totalHeight;
  }

  /**
   * Get current scroll position
   */
  getCurrentScrollPosition(): number {
    return this.viewportState.scrollPosition;
  }

  /**
   * Set scroll position
   */
  setScrollPosition(options: { 
    position?: number; 
    direction?: string; 
    amount?: number; 
    smooth?: boolean; 
  }): void {
    let newPosition: number;

    if (options.position !== undefined) {
      newPosition = options.position;
    } else if (options.direction && options.amount) {
      const currentPos = this.viewportState.scrollPosition;
      const delta = options.direction === 'up' ? -options.amount : options.amount;
      newPosition = currentPos + delta;
    } else {
      return; // Invalid options
    }

    // Clamp position to valid range
    newPosition = Math.max(0, Math.min(
      newPosition, 
      this.viewportState.totalHeight - this.viewportState.viewportHeight
    ));

    if (options.smooth && this.config.smoothScrolling) {
      this.startSmoothScroll(newPosition);
    } else {
      this.viewportState.scrollPosition = newPosition;
      this.updateViewport();
      this.emit('scrollChanged', this.viewportState.scrollPosition);
    }
  }

  /**
   * Start smooth scroll animation
   */
  private startSmoothScroll(targetPosition: number): void {
    if (this.scrollAnimation) {
      clearTimeout(this.scrollAnimation);
    }

    this.smoothScrollTarget = targetPosition;
    this.smoothScrollCurrent = this.viewportState.scrollPosition;
    
    const startTime = Date.now();
    const startPosition = this.smoothScrollCurrent;
    const distance = targetPosition - startPosition;

    const animateScroll = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / this.smoothScrollDuration, 1);
      
      // Easing function (ease-out)
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      const newPosition = startPosition + (distance * easedProgress);
      this.viewportState.scrollPosition = newPosition;
      this.updateViewport();
      this.emit('scrollChanged', this.viewportState.scrollPosition);

      if (progress < 1) {
        this.scrollAnimation = setTimeout(animateScroll, 16); // ~60fps
      } else {
        this.scrollAnimation = undefined;
        this.emit('scrollAnimationComplete', targetPosition);
      }
    };

    animateScroll();
  }

  /**
   * Scroll to top
   */
  scrollToTop(smooth: boolean = true): void {
    this.setScrollPosition({ position: 0, smooth });
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom(smooth: boolean = true): void {
    const maxScroll = Math.max(0, 
      this.viewportState.totalHeight - this.viewportState.viewportHeight
    );
    this.setScrollPosition({ position: maxScroll, smooth });
  }

  /**
   * Scroll by pages
   */
  scrollByPage(direction: 'up' | 'down', smooth: boolean = true): void {
    const pageSize = Math.floor(this.viewportState.viewportHeight * 0.8); // 80% of viewport
    const amount = direction === 'up' ? pageSize : pageSize;
    this.setScrollPosition({ direction, amount, smooth });
  }
  
  /**
   * Get current horizontal scroll position
   */
  getHorizontalScrollPosition(): number {
    return this.viewportState.horizontalScrollPosition;
  }
  
  /**
   * Set horizontal scroll position
   */
  setHorizontalScrollPosition(options: {
    position?: number;
    direction?: string;
    amount?: number;
    smooth?: boolean;
  }): void {
    let newPosition: number;
    
    if (options.position !== undefined) {
      newPosition = options.position;
    } else if (options.direction && options.amount) {
      const currentPos = this.viewportState.horizontalScrollPosition;
      const delta = options.direction === 'left' ? -options.amount : options.amount;
      newPosition = currentPos + delta;
    } else {
      return; // Invalid options
    }
    
    // Clamp position to valid range
    const maxHorizontalScroll = Math.max(0, this.viewportState.totalWidth - this.viewportState.viewportWidth);
    newPosition = Math.max(0, Math.min(newPosition, maxHorizontalScroll));
    
    this.viewportState.horizontalScrollPosition = newPosition;
    this.updateViewport();
    this.emit('horizontalScrollChanged', this.viewportState.horizontalScrollPosition);
  }
  
  /**
   * Scroll horizontally to start
   */
  scrollToStart(smooth: boolean = true): void {
    this.setHorizontalScrollPosition({ position: 0, smooth });
  }
  
  /**
   * Scroll horizontally to end
   */
  scrollToEnd(smooth: boolean = true): void {
    const maxScroll = Math.max(0, this.viewportState.totalWidth - this.viewportState.viewportWidth);
    this.setHorizontalScrollPosition({ position: maxScroll, smooth });
  }

  /**
   * Get visible lines for rendering with virtual scrolling optimization
   */
  getVisibleLines(): { lines: string[]; startIndex: number; endIndex: number } {
    const { visibleStartLine, visibleEndLine } = this.viewportState;
    
    // Virtual scrolling: only render visible lines plus small buffer
    const bufferSize = Math.min(10, Math.floor(this.viewportState.viewportHeight / 2));
    const actualStartLine = Math.max(0, visibleStartLine - bufferSize);
    const actualEndLine = Math.min(this.renderedLines.length - 1, visibleEndLine + bufferSize);
    
    let lines = this.renderedLines.slice(actualStartLine, actualEndLine + 1);
    
    // Add boundary indicators if enabled
    if (this.config.showBoundaryIndicators && lines.length > 0) {
      const isAtTop = this.viewportState.scrollPosition <= 0;
      const isAtBottom = this.viewportState.scrollPosition >= this.viewportState.totalHeight - this.viewportState.viewportHeight;
      
      // Add top boundary indicator
      if (isAtTop && actualStartLine === 0) {
        lines = ['▲ ─── TOP OF CONVERSATION ─── ▲', '', ...lines];
      }
      
      // Add bottom boundary indicator  
      if (isAtBottom && actualEndLine === this.renderedLines.length - 1) {
        lines = [...lines, '', '▼ ─── END OF CONVERSATION ─── ▼'];
      }
    }
    
    // For very long conversations, add performance indicators
    if (this.renderedLines.length > 1000) {
      const totalLines = this.renderedLines.length;
      const visiblePercent = Math.round((visibleEndLine / totalLines) * 100);
      
      // Add a subtle progress indicator at the end
      if (lines.length > 0) {
        lines[lines.length - 1] += `  (${visiblePercent}%)`;
      }
    }
    
    return {
      lines,
      startIndex: actualStartLine,
      endIndex: actualEndLine,
    };
  }

  /**
   * Get conversation performance metrics
   */
  getPerformanceMetrics(): {
    totalMessages: number;
    totalLines: number;
    visibleLines: number;
    memoryEfficiency: string;
    renderingMode: string;
  } {
    const totalMessages = this.messages.length;
    const totalLines = this.renderedLines.length;
    const visibleLines = this.viewportState.visibleEndLine - this.viewportState.visibleStartLine + 1;
    
    const memoryUsage = totalLines > 500 ? 'High' : totalLines > 100 ? 'Medium' : 'Low';
    const renderingMode = totalLines > 1000 ? 'Virtual' : 'Standard';
    
    return {
      totalMessages,
      totalLines,
      visibleLines,
      memoryEfficiency: memoryUsage,
      renderingMode,
    };
  }

  /**
   * Search for text in conversation
   */
  searchMessages(query: string, caseSensitive: boolean = false): Array<{
    messageIndex: number;
    lineIndex: number;
    match: string;
    context: string;
  }> {
    const results: Array<{
      messageIndex: number;
      lineIndex: number;
      match: string;
      context: string;
    }> = [];

    const searchQuery = caseSensitive ? query : query.toLowerCase();

    for (let msgIndex = 0; msgIndex < this.messages.length; msgIndex++) {
      const message = this.messages[msgIndex];
      const content = caseSensitive ? message.content : message.content.toLowerCase();
      
      const lines = content.split('\n');
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        
        if (line.includes(searchQuery)) {
          results.push({
            messageIndex: msgIndex,
            lineIndex,
            match: query,
            context: line.trim(),
          });
        }
      }
    }

    return results;
  }

  /**
   * Jump to specific message
   */
  jumpToMessage(messageIndex: number, smooth: boolean = true): void {
    if (messageIndex < 0 || messageIndex >= this.messages.length) {
      return;
    }

    // Calculate line position for this message
    let linePosition = 0;
    
    for (let i = 0; i < messageIndex; i++) {
      const messageLines = this.renderMessage(this.messages[i], i);
      linePosition += messageLines.length + 1; // +1 for separator
    }

    this.setScrollPosition({ position: linePosition, smooth });
  }

  /**
   * Get configuration
   */
  getConfig(): RenderConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Re-render if configuration affects display
    if (newConfig.enableWordWrap !== undefined || 
        newConfig.enableSyntaxHighlighting !== undefined ||
        newConfig.showTimestamps !== undefined) {
      this.renderMessages();
      this.updateViewport();
    }
    
    this.emit('configChanged', this.config);
  }

  /**
   * Get viewport state for debugging
   */
  getViewportState(): ViewportState {
    return { ...this.viewportState };
  }

  /**
   * Dispose of the renderer
   */
  dispose(): void {
    if (this.scrollAnimation) {
      clearTimeout(this.scrollAnimation);
    }
    
    this.removeAllListeners();
    this.messages = [];
    this.renderedLines = [];
  }
}