/**
 * Visual Regression Testing Suite
 * Comprehensive screenshot-based UI tests for Claude Code parity validation
 * Tests across different terminal environments and color schemes
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render } from 'ink-testing-library';
import { Header } from '../../tui/components/Header.js';
import { ConversationArea } from '../../tui/components/ConversationArea.js';
import { OptimizedConversationArea } from '../../tui/components/OptimizedConversationArea.js';
import { StatusLine } from '../../tui/status-line.js';
import { VirtualScrollList } from '../../tui/components/VirtualScrollList.js';
import { ConversationMessage } from '../../tui/conversation-renderer.js';
import { StatusMetrics } from '../../tui/status-manager.js';

// Mock terminal capabilities for consistent testing
jest.mock('process', () => ({
  ...jest.requireActual('process'),
  stdout: {
    columns: 80,
    rows: 24,
    isTTY: true,
    hasColors: () => true,
  },
  env: {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
  },
}));

describe('Visual Regression Testing Suite', () => {
  let mockMessages: ConversationMessage[];
  let mockMetrics: StatusMetrics;

  beforeEach(() => {
    // Setup consistent test data
    mockMessages = [
      {
        role: 'user',
        content: 'Hello, can you help me with TypeScript?',
        timestamp: 1699123456000,
        metadata: { tokensUsed: 10 },
      },
      {
        role: 'assistant',
        content: 'Of course! TypeScript is a strongly typed programming language that builds on JavaScript. Here\'s what you need to know:\n\n```typescript\ninterface User {\n  name: string;\n  age: number;\n}\n\nconst user: User = {\n  name: "Alice",\n  age: 30\n};\n```\n\nThis code defines a User interface and creates a user object.',
        timestamp: 1699123458000,
        metadata: { tokensUsed: 85, model: 'claude-3-5-sonnet-20241022' },
      },
      {
        role: 'user', 
        content: 'That\'s helpful! Can you explain generics?',
        timestamp: 1699123460000,
        metadata: { tokensUsed: 12 },
      },
      {
        role: 'assistant',
        content: 'Generics allow you to write reusable code that works with multiple types:\n\n```typescript\nfunction identity<T>(arg: T): T {\n  return arg;\n}\n\n// Usage\nconst stringResult = identity<string>("hello");\nconst numberResult = identity<number>(42);\n```\n\nThe `<T>` is a type parameter that gets replaced with actual types when called.',
        timestamp: 1699123462000,
        metadata: { tokensUsed: 65, model: 'claude-3-5-sonnet-20241022' },
      },
    ];

    mockMetrics = {
      inputTokens: 100,
      outputTokens: 150,
      totalTokens: 250,
      responseTime: 1250,
      averageResponseTime: 1180,
      memoryUsageMB: 42.8,
      memoryPercentage: 28,
      sessionTurns: 4,
      sessionTokens: 500,
      streamProgress: 0,
      charactersStreamed: 0,
      activeToolCall: null,
      toolCallHistory: [],
      lastError: null,
      indeterminateProgress: false,
      currentCost: 0.0025,
      sessionCost: 0.0125,
      todayCost: 0.0325,
      costPerToken: 0.00001,
      projectedCost: 0.015,
      costThreshold: 1.0,
      model: 'claude-3-5-sonnet-20241022',
      provider: 'copilot'
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Header Component Visual Tests', () => {
    it('should render header with model and connection status - standard terminal', () => {
      const { lastFrame } = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="connected"
          connectionStatus="connected"
          tokens={250}
          latency={1250}
          sessionInfo={{
            startTime: new Date(),
            messageCount: 4
          }}
        />
      );

      const frame = lastFrame();
      
      // Verify header structure and content
      expect(frame).toContain('claude-3-5-sonnet-20241022');
      expect(frame).toContain('copilot');
      expect(frame).toContain('250');
      
      // Visual layout verification
      const lines = frame.split('\n').filter(line => line.trim().length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(1);
      
      // Store frame snapshot for regression comparison
      expect(frame).toMatchSnapshot('header-standard-terminal');
    });

    it('should render header in narrow terminal (40 columns)', () => {
      // Mock narrow terminal
      Object.defineProperty(process.stdout, 'columns', { value: 40 });
      
      const { lastFrame } = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="connected"
          connectionStatus="connected"
          tokens={250}
          latency={1250}
          sessionInfo={{
            startTime: new Date(),
            messageCount: 4
          }}
        />
      );

      const frame = lastFrame();
      
      // Verify responsive behavior in narrow terminal
      expect(frame).toMatchSnapshot('header-narrow-terminal');
      
      // Restore original width
      Object.defineProperty(process.stdout, 'columns', { value: 80 });
    });

    it('should render header with disconnected status', () => {
      const { lastFrame } = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="disconnected"
          connectionStatus="disconnected"
          tokens={0}
          latency={0}
        />
      );

      const frame = lastFrame();
      
      expect(frame).toContain('disconnected');
      expect(frame).toMatchSnapshot('header-disconnected');
    });

    it('should render header with high token usage warning', () => {
      const { lastFrame } = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="connected"
          connectionStatus="connected"
          tokens={15000} // High token count
          latency={3500} // Slow response
          sessionInfo={{
            startTime: new Date(),
            messageCount: 25
          }}
        />
      );

      const frame = lastFrame();
      
      expect(frame).toContain('15000');
      expect(frame).toContain('3.50s');
      expect(frame).toContain('85.2MB');
      expect(frame).toMatchSnapshot('header-high-usage');
    });
  });

  describe('ConversationArea Visual Tests', () => {
    it('should render basic conversation with user and assistant messages', () => {
      const { lastFrame } = render(
        <ConversationArea
          messages={mockMessages.slice(0, 2)}
          height={10}
          showTimestamps={true}
        />
      );

      const frame = lastFrame();
      
      // Verify message content is displayed
      expect(frame).toContain('Hello, can you help me with TypeScript?');
      expect(frame).toContain('Of course! TypeScript is a strongly typed');
      expect(frame).toContain('interface User');
      
      // Visual structure verification
      expect(frame).toMatchSnapshot('conversation-basic');
    });

    it('should render conversation with code blocks and syntax highlighting', () => {
      const { lastFrame } = render(
        <ConversationArea
          messages={mockMessages}
          height={15}
          showTimestamps={true}
          showMetadata={true}
        />
      );

      const frame = lastFrame();
      
      // Verify code blocks are rendered
      expect(frame).toContain('```typescript');
      expect(frame).toContain('interface User');
      expect(frame).toContain('function identity<T>');
      
      // Verify metadata display
      expect(frame).toContain('claude-3-5-sonnet-20241022');
      expect(frame).toContain('85'); // token count
      
      expect(frame).toMatchSnapshot('conversation-with-code');
    });

    it('should render empty conversation state', () => {
      const { lastFrame } = render(
        <ConversationArea
          messages={[]}
          height={10}
          showTimestamps={true}
        />
      );

      const frame = lastFrame();
      
      expect(frame).toContain('Welcome to Plato');
      expect(frame).toContain('Start a conversation');
      expect(frame).toContain('/help for available commands');
      expect(frame).toMatchSnapshot('conversation-empty');
    });

    it('should render conversation with long messages and proper wrapping', () => {
      const longMessage: ConversationMessage = {
        role: 'assistant',
        content: 'This is a very long message that should wrap properly across multiple lines in the terminal interface. It contains detailed explanations and should maintain readability even when the content exceeds the terminal width. The visual regression test should verify that text wrapping works consistently across different terminal environments and screen sizes.',
        timestamp: 1699123470000,
        metadata: { tokensUsed: 45 },
      };

      const { lastFrame } = render(
        <ConversationArea
          messages={[longMessage]}
          height={8}
          width={60}
          showTimestamps={true}
        />
      );

      const frame = lastFrame();
      
      expect(frame).toContain('This is a very long message');
      expect(frame).toContain('terminal interface');
      expect(frame).toMatchSnapshot('conversation-long-message');
    });
  });

  describe('OptimizedConversationArea Visual Tests', () => {
    it('should render optimized conversation area with performance monitoring', () => {
      const { lastFrame } = render(
        <OptimizedConversationArea
          messages={mockMessages}
          height={12}
          width={80}
          showTimestamps={true}
          virtualScrolling={true}
          showPerformanceOverlay={true}
          targetFPS={60}
        />
      );

      const frame = lastFrame();
      
      // Verify virtual scrolling is working
      expect(frame).toContain('Hello, can you help me');
      expect(frame).toContain('TypeScript is a strongly typed');
      
      // Performance overlay should be visible (if enabled)
      expect(frame).toMatchSnapshot('optimized-conversation-with-perf');
    });

    it('should render optimized conversation without performance overlay', () => {
      const { lastFrame } = render(
        <OptimizedConversationArea
          messages={mockMessages}
          height={12}
          width={80}
          showTimestamps={false}
          virtualScrolling={true}
          showPerformanceOverlay={false}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('optimized-conversation-clean');
    });
  });

  describe('StatusLine Visual Tests', () => {
    it('should render status line with comprehensive metrics', () => {
      const { lastFrame } = render(
        <StatusLine
          metrics={mockMetrics}
          state="idle"
          compact={false}
        />
      );

      const frame = lastFrame();
      
      // Verify all metrics are displayed
      expect(frame).toContain('100'); // input tokens
      expect(frame).toContain('150'); // output tokens
      expect(frame).toContain('1.25s'); // response time
      expect(frame).toContain('42.8MB'); // memory usage
      expect(frame).toContain('4'); // session turns
      expect(frame).toContain('0.0125'); // session cost
      
      expect(frame).toMatchSnapshot('status-line-full-metrics');
    });

    it('should render status line with streaming progress', () => {
      const streamingMetrics: StatusMetrics = {
        ...mockMetrics,
        streamProgress: 45,
        charactersStreamed: 128,
        indeterminateProgress: false,
      };

      const { lastFrame } = render(
        <StatusLine
          metrics={streamingMetrics}
          state="streaming"
          compact={false}
          showSpinner={true}
        />
      );

      const frame = lastFrame();
      
      expect(frame).toContain('45%'); // progress percentage
      expect(frame).toContain('128'); // characters streamed
      expect(frame).toMatchSnapshot('status-line-streaming');
    });

    it('should render status line in narrow terminal', () => {
      const { lastFrame } = render(
        <StatusLine
          metrics={mockMetrics}
          state="idle"
          compact={true}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('status-line-narrow');
    });
  });

  describe('VirtualScrollList Visual Tests', () => {
    interface TestItem {
      id: string;
      content: React.ReactNode;
    }

    it('should render virtual scroll list with multiple items', () => {
      const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({
        id: `item-${i}`,
        content: `Item ${i + 1}: This is a test item for virtual scrolling`,
      }));

      const renderItem = (item: TestItem) => (
        React.createElement('div', { key: item.id }, item.content)
      );

      const { lastFrame } = render(
        React.createElement(VirtualScrollList, {
          items,
          height: 8,
          width: 60,
          renderItem,
          overscan: 2,
          estimatedItemHeight: 1,
        })
      );

      const frame = lastFrame();
      
      // Should show first few items within viewport
      expect(frame).toContain('Item 1');
      expect(frame).toContain('Item 2');
      expect(frame).toMatchSnapshot('virtual-scroll-basic');
    });
  });

  describe('Performance Monitoring Tests', () => {
    it('should track rendering performance', () => {
      const startTime = process.hrtime.bigint();
      
      const { lastFrame } = render(
        <ConversationArea
          messages={mockMessages}
          height={10}
        />
      );
      
      const endTime = process.hrtime.bigint();
      const renderTime = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
      
      // Should render within performance budget (60fps = ~16.67ms per frame)
      expect(renderTime).toBeLessThan(50); // Generous budget for testing
      expect(lastFrame()).toContain('Hello, can you help me');
    });

    it('should handle performance stress test', () => {
      const startTime = process.hrtime.bigint();
      
      const { lastFrame, rerender } = render(
        <ConversationArea
          messages={mockMessages}
          height={15}
        />
      );
      
      // Test multiple re-renders (simulating rapid updates)
      for (let i = 0; i < 5; i++) {
        rerender(
          <ConversationArea
            messages={mockMessages.slice(0, i + 1)}
            height={15}
          />
        );
      }
      
      const endTime = process.hrtime.bigint();
      const totalTime = Number(endTime - startTime) / 1_000_000;
      
      expect(totalTime).toBeLessThan(200); // Should handle multiple renders efficiently
      expect(lastFrame()).toBeDefined();
    });
  });

  describe('Color Scheme Variations', () => {
    beforeEach(() => {
      // Mock different color capabilities
      jest.clearAllMocks();
    });

    it('should render with truecolor support (24-bit)', () => {
      process.env.COLORTERM = 'truecolor';
      process.env.TERM = 'xterm-256color';
      
      const { lastFrame } = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="connected"
          connectionStatus="connected"
          tokens={250}
          sessionInfo={{
            startTime: new Date(),
            messageCount: 3
          }}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('header-truecolor');
    });

    it('should render with 256-color support', () => {
      process.env.COLORTERM = '';
      process.env.TERM = 'xterm-256color';
      
      const { lastFrame } = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="connected"
          connectionStatus="connected"
          tokens={250}
          sessionInfo={{
            startTime: new Date(),
            messageCount: 3
          }}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('header-256color');
    });

    it('should render with basic color support (16-color)', () => {
      process.env.COLORTERM = '';
      process.env.TERM = 'xterm';
      
      const { lastFrame } = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="connected"
          connectionStatus="connected"
          tokens={250}
          sessionInfo={{
            startTime: new Date(),
            messageCount: 3
          }}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('header-basic-color');
    });

    it('should render without color support (monochrome)', () => {
      process.env.COLORTERM = '';
      process.env.TERM = 'dumb';
      
      const { lastFrame } = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="connected"
          connectionStatus="connected"
          tokens={250}
          sessionInfo={{
            startTime: new Date(),
            messageCount: 3
          }}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('header-monochrome');
    });
  });

  describe('Terminal Environment Variations', () => {
    it('should render properly in Windows Terminal', () => {
      process.env.TERM_PROGRAM = 'Windows Terminal';
      process.env.TERM = 'xterm-256color';
      
      const { lastFrame } = render(
        <ConversationArea
          messages={mockMessages.slice(0, 2)}
          height={8}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('conversation-windows-terminal');
    });

    it('should render properly in iTerm2', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      process.env.TERM = 'xterm-256color';
      
      const { lastFrame } = render(
        <ConversationArea
          messages={mockMessages.slice(0, 2)}
          height={8}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('conversation-iterm2');
    });

    it('should render properly in VSCode integrated terminal', () => {
      process.env.TERM_PROGRAM = 'vscode';
      process.env.TERM = 'xterm-256color';
      
      const { lastFrame } = render(
        <ConversationArea
          messages={mockMessages.slice(0, 2)}
          height={8}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('conversation-vscode');
    });

    it('should render properly in basic Linux terminal', () => {
      process.env.TERM_PROGRAM = '';
      process.env.TERM = 'linux';
      
      const { lastFrame } = render(
        <ConversationArea
          messages={mockMessages.slice(0, 2)}
          height={8}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('conversation-linux');
    });
  });

  describe('Responsive Layout Tests', () => {
    it('should adapt to very narrow terminal (20 columns)', () => {
      Object.defineProperty(process.stdout, 'columns', { value: 20 });
      
      const { lastFrame } = render(
        <ConversationArea
          messages={[mockMessages[0]]}
          height={5}
          width={20}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('conversation-very-narrow');
      
      // Restore width
      Object.defineProperty(process.stdout, 'columns', { value: 80 });
    });

    it('should adapt to very wide terminal (200 columns)', () => {
      Object.defineProperty(process.stdout, 'columns', { value: 200 });
      
      const { lastFrame } = render(
        <ConversationArea
          messages={mockMessages}
          height={10}
          width={200}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('conversation-very-wide');
      
      // Restore width
      Object.defineProperty(process.stdout, 'columns', { value: 80 });
    });

    it('should handle very short terminal (5 rows)', () => {
      Object.defineProperty(process.stdout, 'rows', { value: 5 });
      
      const { lastFrame } = render(
        <ConversationArea
          messages={mockMessages.slice(0, 1)}
          height={3}
        />
      );

      const frame = lastFrame();
      expect(frame).toMatchSnapshot('conversation-very-short');
      
      // Restore height
      Object.defineProperty(process.stdout, 'rows', { value: 24 });
    });
  });

  describe('Automated Visual Diff Detection', () => {
    it('should detect visual changes in header layout', () => {
      // Test multiple renders to ensure consistency
      const render1 = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="connected"
          connectionStatus="connected"
          tokens={250}
          sessionInfo={{
            startTime: new Date(1699123456000), // Fixed timestamp for consistency
            messageCount: 3
          }}
        />
      );
      
      const render2 = render(
        <Header
          model="claude-3-5-sonnet-20241022"
          provider="copilot"
          providerStatus="connected"
          connectionStatus="connected"
          tokens={250}
          sessionInfo={{
            startTime: new Date(1699123456000), // Fixed timestamp for consistency
            messageCount: 3
          }}
        />
      );

      // Frames should be identical for same props
      expect(render1.lastFrame()).toBe(render2.lastFrame());
    });

    it('should detect visual changes in conversation layout', () => {
      const baseMessages = mockMessages.slice(0, 2);
      
      const render1 = render(
        <ConversationArea
          messages={baseMessages}
          height={8}
        />
      );
      
      const render2 = render(
        <ConversationArea
          messages={baseMessages}
          height={8}
        />
      );

      // Should produce identical output for same input
      expect(render1.lastFrame()).toBe(render2.lastFrame());
    });

    it('should provide visual diff information for debugging', () => {
      const originalMessages = mockMessages.slice(0, 2);
      const modifiedMessages = [...originalMessages, {
        role: 'user',
        content: 'Additional test message',
        timestamp: Date.now(),
      } as ConversationMessage];
      
      const originalRender = render(
        <ConversationArea messages={originalMessages} height={8} />
      );
      
      const modifiedRender = render(
        <ConversationArea messages={modifiedMessages} height={8} />
      );

      // Should detect difference in content
      expect(originalRender.lastFrame()).not.toBe(modifiedRender.lastFrame());
      
      // Modified version should contain the additional message
      expect(modifiedRender.lastFrame()).toContain('Additional test message');
    });
  });
});