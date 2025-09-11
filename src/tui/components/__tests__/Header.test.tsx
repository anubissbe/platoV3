import React from 'react';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render } from 'ink-testing-library';
import { Header } from '../Header.js';

// Mock the style manager
jest.mock('../../../styles/manager.js', () => ({
  getStyleManager: jest.fn(() => ({
    getStyle: jest.fn(() => ({
      theme: {
        primary: 'cyan',
        secondary: 'gray',
        success: 'green',
        error: 'red',
        warning: 'yellow',
        info: 'blue'
      },
      formatting: {
        bold: false,
        italic: false,
        underline: false
      },
      components: {
        statusLine: {
          format: '{mode} | {model} | {tokens} tokens'
        }
      }
    }))
  }))
}));

// Mock config
jest.mock('../../../config.js', () => ({
  loadConfig: jest.fn(() => Promise.resolve({
    defaultModel: 'gpt-4',
    githubToken: 'test-token'
  }))
}));

// Mock provider
jest.mock('../../../providers/copilot.js', () => ({
  getConnectionStatus: jest.fn(() => Promise.resolve('connected'))
}));

describe('Header Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Layout and Structure', () => {
    it('renders header with proper layout matching Claude Code style', () => {
      const { lastFrame } = render(<Header />);
      
      // Should contain the main header structure
      expect(lastFrame()).toContain('plato');
    });

    it('displays header in top position with proper spacing', () => {
      const { lastFrame } = render(<Header />);
      const frame = lastFrame();
      
      // Check that it has proper visual structure
      expect(frame).toContain('│'); // Box border
      expect(frame.split('\n').length).toBeGreaterThan(1); // Multiple lines
    });
  });

  describe('Model Information Display', () => {
    it('displays current model information', () => {
      const { lastFrame } = render(
        <Header 
          model="gpt-4" 
          provider="copilot" 
        />
      );
      
      expect(lastFrame()).toContain('gpt-4');
      expect(lastFrame()).toContain('copilot');
    });

    it('shows provider status with visual indicators', () => {
      const { lastFrame } = render(
        <Header 
          provider="copilot"
          providerStatus="connected" 
        />
      );
      
      expect(lastFrame()).toContain('copilot');
      expect(lastFrame()).toMatch(/connected|✓|●/); // Status indicators
    });

    it('handles disconnected provider status', () => {
      const { lastFrame } = render(
        <Header 
          provider="copilot"
          providerStatus="disconnected" 
        />
      );
      
      expect(lastFrame()).toMatch(/disconnected|✗|○/); // Disconnected indicators
    });
  });

  describe('Token Usage and Rate Limiting', () => {
    it('displays current token usage information', () => {
      const { lastFrame } = render(
        <Header 
          tokens={1250}
          maxTokens={4000}
        />
      );
      
      expect(lastFrame()).toContain('1250');
      expect(lastFrame()).toContain('4000');
    });

    it('shows token usage percentage when available', () => {
      const { lastFrame } = render(
        <Header 
          tokens={2000}
          maxTokens={4000}
        />
      );
      
      expect(lastFrame()).toMatch(/50%|2000\/4000/);
    });

    it('displays rate limiting information', () => {
      const { lastFrame } = render(
        <Header 
          rateLimit={{
            requests: 45,
            maxRequests: 50,
            resetTime: new Date(Date.now() + 60000)
          }}
        />
      );
      
      expect(lastFrame()).toContain('45');
      expect(lastFrame()).toContain('50');
    });
  });

  describe('Connection Status Indicators', () => {
    it('shows connection status with proper visual indicators', () => {
      const { lastFrame } = render(
        <Header 
          connectionStatus="connected"
          latency={120}
        />
      );
      
      expect(lastFrame()).toMatch(/connected|✓|●/);
      expect(lastFrame()).toContain('120ms');
    });

    it('displays warning for high latency', () => {
      const { lastFrame } = render(
        <Header 
          connectionStatus="connected"
          latency={2000}
        />
      );
      
      expect(lastFrame()).toMatch(/2000ms|slow|⚠/);
    });

    it('shows error state for connection failures', () => {
      const { lastFrame } = render(
        <Header 
          connectionStatus="error"
          error="Connection failed"
        />
      );
      
      expect(lastFrame()).toMatch(/error|failed|✗|○/);
    });
  });

  describe('Status Line Integration', () => {
    it('connects with existing statusline configuration', () => {
      const { lastFrame } = render(
        <Header 
          statusLineConfig={{
            mode: 'streaming',
            context: 'test-context',
            session: 'session-123'
          }}
        />
      );
      
      expect(lastFrame()).toContain('streaming');
      expect(lastFrame()).toContain('test-context');
    });

    it('displays keyboard shortcuts when enabled', () => {
      const { lastFrame } = render(
        <Header 
          showKeyboardShortcuts={true}
        />
      );
      
      expect(lastFrame()).toMatch(/Ctrl\+C|Esc|\/help/);
    });

    it('includes session information display', () => {
      const { lastFrame } = render(
        <Header 
          sessionInfo={{
            startTime: new Date(Date.now() - 300000), // 5 minutes ago
            messageCount: 12
          }}
        />
      );
      
      expect(lastFrame()).toContain('12'); // Message count
      expect(lastFrame()).toMatch(/5m|0:05/); // Duration display
    });
  });

  describe('Dynamic Status Updates', () => {
    it('updates display when props change', () => {
      const { lastFrame, rerender } = render(
        <Header tokens={100} />
      );
      
      expect(lastFrame()).toContain('100');
      
      rerender(<Header tokens={200} />);
      expect(lastFrame()).toContain('200');
      expect(lastFrame()).not.toContain('100');
    });

    it('handles real-time status changes', () => {
      const { lastFrame, rerender } = render(
        <Header connectionStatus="connecting" />
      );
      
      expect(lastFrame()).toMatch(/connecting|\.{3}/);
      
      rerender(<Header connectionStatus="connected" />);
      expect(lastFrame()).toMatch(/connected|✓/);
    });
  });

  describe('Error Handling', () => {
    it('gracefully handles missing model information', () => {
      const { lastFrame } = render(<Header />);
      
      // Should not crash and show fallback
      expect(lastFrame()).toBeTruthy();
      expect(lastFrame()).toMatch(/unknown|--|-/);
    });

    it('handles undefined token counts', () => {
      const { lastFrame } = render(<Header tokens={undefined} />);
      
      expect(lastFrame()).toBeTruthy();
      expect(lastFrame()).toMatch(/--|0|unknown/);
    });
  });

  describe('Performance', () => {
    it('renders efficiently without unnecessary re-renders', () => {
      const renderSpy = jest.fn();
      
      // This test would require more sophisticated mocking
      // For now, just ensure it renders without throwing
      expect(() => {
        render(<Header />);
      }).not.toThrow();
    });
  });
});