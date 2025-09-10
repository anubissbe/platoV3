/**
 * Test suite for long AI response scrolling and virtual rendering
 * Tests performance optimization and memory efficiency for large conversations
 */

import { ConversationRenderer } from '../tui/conversation-renderer';
import { ScrollController } from '../tui/scroll-controller';

describe('Long AI Response Scrolling', () => {
  let conversationRenderer: ConversationRenderer;
  let scrollController: ScrollController;

  beforeEach(() => {
    conversationRenderer = new ConversationRenderer({
      maxLinesVisible: 10,
      enableSyntaxHighlighting: true,
      enableWordWrap: true,
      indentSize: 2,
      showTimestamps: false,
      smoothScrolling: true,
    });

    scrollController = new ScrollController({
      scrollSensitivity: 3,
      smoothScrolling: true,
      scrollDuration: 150,
      enableMomentum: true,
    });

    scrollController.setRenderer(conversationRenderer);
  });

  afterEach(() => {
    conversationRenderer.dispose();
    scrollController.dispose();
  });

  describe('Large Response Handling', () => {
    test('should efficiently handle very long AI responses', () => {
      // Create a very long AI response (5000 words)
      const longResponse = Array(5000).fill('word').join(' ');
      
      const message = {
        role: 'assistant' as const,
        content: longResponse,
        timestamp: Date.now(),
        metadata: {
          tokensUsed: 5000,
          model: 'claude-3.5-sonnet',
          duration: 30000,
        },
      };

      conversationRenderer.addMessage(message);

      const totalHeight = conversationRenderer.getTotalHeight();
      expect(totalHeight).toBeGreaterThan(100); // Should wrap to many lines
      
      // Virtual scrolling should only render visible portion
      const { lines, startIndex, endIndex } = conversationRenderer.getVisibleLines();
      expect(lines.length).toBeLessThanOrEqual(30); // Buffer + visible lines
      expect(endIndex - startIndex).toBeLessThan(totalHeight);
    });

    test('should handle code blocks in long responses without wrapping', () => {
      const longCodeResponse = `Here's a complex implementation:

\`\`\`typescript
function complexFunction() {
  const reallyLongVariableName = 'this is a very long string that would normally wrap but should not in code blocks because it would break formatting';
  return reallyLongVariableName.split('').map(char => char.toUpperCase()).join('');
}
\`\`\`

This code demonstrates the concept.`;

      const message = {
        role: 'assistant' as const,
        content: longCodeResponse,
        timestamp: Date.now(),
      };

      conversationRenderer.addMessage(message);

      const { lines } = conversationRenderer.getVisibleLines();
      const codeLine = lines.find(line => line.includes('reallyLongVariableName'));
      
      // Code lines should not be broken even if long
      expect(codeLine).toBeDefined();
      expect(codeLine!.length).toBeGreaterThan(50); // Should be a reasonably long line
    });

    test('should provide performance metrics for large conversations', () => {
      // Add multiple large messages
      for (let i = 0; i < 50; i++) {
        const message = {
          role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
          content: `This is message ${i} with some substantial content that will create multiple lines when rendered. It includes various formatting and should demonstrate the performance characteristics of the conversation renderer.`,
          timestamp: Date.now() - (50 - i) * 1000,
        };
        conversationRenderer.addMessage(message);
      }

      const metrics = conversationRenderer.getPerformanceMetrics();
      
      expect(metrics.totalMessages).toBe(50);
      expect(metrics.totalLines).toBeGreaterThan(100);
      expect(metrics.visibleLines).toBeLessThanOrEqual(10);
      expect(['Low', 'Medium', 'High']).toContain(metrics.memoryEfficiency);
      expect(['Standard', 'Virtual']).toContain(metrics.renderingMode);
    });
  });

  describe('Virtual Scrolling Performance', () => {
    test('should maintain smooth scrolling with 1000+ line conversations', () => {
      // Create a massive conversation
      for (let i = 0; i < 200; i++) {
        const message = {
          role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
          content: `Message ${i}: ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20),
          timestamp: Date.now() - (200 - i) * 1000,
        };
        conversationRenderer.addMessage(message);
      }

      const totalLines = conversationRenderer.getTotalHeight();
      expect(totalLines).toBeGreaterThan(1000);

      // Test scrolling performance
      const startTime = performance.now();
      
      // Scroll through the entire conversation
      for (let pos = 0; pos < totalLines; pos += 50) {
        scrollController.restoreScrollPosition(pos);
        const { lines } = conversationRenderer.getVisibleLines();
        expect(lines.length).toBeGreaterThan(0);
      }
      
      const endTime = performance.now();
      const scrollingTime = endTime - startTime;
      
      // Should complete in reasonable time (< 100ms for all scrolling operations)
      expect(scrollingTime).toBeLessThan(100);
    });

    test('should include progress indicators for very long conversations', () => {
      // Create conversation with 1000+ lines
      for (let i = 0; i < 100; i++) {
        const message = {
          role: 'assistant' as const,
          content: 'Long content line\n'.repeat(15), // 15 lines per message
          timestamp: Date.now() - i * 1000,
        };
        conversationRenderer.addMessage(message);
      }

      const totalLines = conversationRenderer.getTotalHeight();
      expect(totalLines).toBeGreaterThan(1000);

      // Scroll to middle
      scrollController.restoreScrollPosition(Math.floor(totalLines / 2));
      
      const { lines } = conversationRenderer.getVisibleLines();
      const lastLine = lines[lines.length - 1];
      
      // Should include progress indicator
      expect(lastLine).toMatch(/\(\d+%\)/);
    });
  });

  describe('Memory Efficiency', () => {
    test('should not load entire conversation into memory at once', () => {
      // Add many large messages
      for (let i = 0; i < 100; i++) {
        const message = {
          role: 'assistant' as const,
          content: 'Large response content '.repeat(100), // 2000+ characters each
          timestamp: Date.now() - i * 1000,
        };
        conversationRenderer.addMessage(message);
      }

      // Get visible lines should return only a subset
      const { lines, startIndex, endIndex } = conversationRenderer.getVisibleLines();
      const totalLines = conversationRenderer.getTotalHeight();
      
      expect(lines.length).toBeLessThan(totalLines / 2); // Should be much smaller than total
      expect(endIndex - startIndex).toBeLessThan(50); // Reasonable buffer size
    });

    test('should handle terminal width changes dynamically', () => {
      const message = {
        role: 'assistant' as const,
        content: 'This is a very long line that will wrap differently based on terminal width settings and should adapt properly to different screen sizes.',
        timestamp: Date.now(),
      };

      conversationRenderer.addMessage(message);

      // Mock different terminal widths
      const originalColumns = process.stdout.columns;
      
      // Test narrow terminal
      Object.defineProperty(process.stdout, 'columns', { value: 40, configurable: true });
      conversationRenderer.updateConfig({ enableWordWrap: true });
      const narrowLines = conversationRenderer.getVisibleLines();
      
      // Test wide terminal  
      Object.defineProperty(process.stdout, 'columns', { value: 120, configurable: true });
      conversationRenderer.updateConfig({ enableWordWrap: true });
      const wideLines = conversationRenderer.getVisibleLines();
      
      // Should have different line counts due to different wrapping
      expect(narrowLines.lines.length).toBeGreaterThan(wideLines.lines.length);

      // Restore original
      Object.defineProperty(process.stdout, 'columns', { value: originalColumns, configurable: true });
    });
  });

  describe('Content Type Optimization', () => {
    test('should handle mixed content types efficiently', () => {
      const mixedContent = `Here's an explanation with markdown and code.

\`\`\`javascript
function example() {
  const longVariableName = 'this should not wrap in code blocks even though it is quite long';
  return longVariableName.toUpperCase();
}
\`\`\`

And regular paragraphs that should be wrapped properly according to terminal width.`;

      const message = {
        role: 'assistant' as const,
        content: mixedContent,
        timestamp: Date.now(),
      };

      conversationRenderer.addMessage(message);

      const { lines } = conversationRenderer.getVisibleLines();
      
      // Should handle different content types appropriately
      const codeLines = lines.filter(line => line.includes('longVariableName'));
      const paragraphLines = lines.filter(line => line.includes('regular paragraphs') || line.includes('wrapped properly'));
      
      expect(codeLines.length).toBeGreaterThan(0);
      expect(paragraphLines.length).toBeGreaterThan(0);
      
      // Code lines should be preserved as-is
      if (codeLines.length > 0) {
        expect(codeLines[0].length).toBeGreaterThan(50);
      }
    });
  });
});