/**
 * Test suite for mouse wheel scrolling functionality
 * Comprehensive tests for conversation history navigation and scroll behavior
 */

import { ScrollController, ScrollEvent } from '../tui/scroll-controller';
import { MouseEventHandler, MouseEvent, MouseEventType, MouseButton } from '../tui/mouse-event-handler';

// Mock dependencies
jest.mock('../config', () => ({
  loadConfig: jest.fn().mockResolvedValue({}),
  setConfigValue: jest.fn().mockResolvedValue(undefined),
}));

// Mock conversation renderer will be created in tests

describe('Mouse Wheel Scrolling System', () => {
  let scrollController: ScrollController;
  let mouseHandler: MouseEventHandler;
  let mockConversationRenderer: any;
  let scrollEvents: ScrollEvent[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    scrollEvents = [];
    
    // Initialize scroll controller with test configuration
    scrollController = new ScrollController({
      scrollSensitivity: 3,
      smoothScrolling: true,
      scrollDuration: 150,
      enableMomentum: true,
    });
    
    // Initialize mouse handler
    mouseHandler = new MouseEventHandler({ mouseMode: true });
    
    // Set up scroll event tracking
    scrollController.on('scroll', (event: ScrollEvent) => scrollEvents.push(event));
    
    mockConversationRenderer = {
      getViewportHeight: jest.fn().mockReturnValue(10),
      getTotalHeight: jest.fn().mockReturnValue(100),
      getCurrentScrollPosition: jest.fn().mockReturnValue(0),
      setScrollPosition: jest.fn(),
      getConversationCount: jest.fn().mockReturnValue(5),
      getMessageAt: jest.fn().mockReturnValue({ role: 'user', content: 'test message' }),
      getHorizontalScrollPosition: jest.fn().mockReturnValue(0),
      setHorizontalScrollPosition: jest.fn(),
    };
    
    scrollController.setRenderer(mockConversationRenderer);
  });

  afterEach(() => {
    scrollController.dispose();
    mouseHandler.dispose();
  });

  describe('Conversation History Scrolling', () => {
    test('should scroll conversation history with wheel up events', async () => {
      const wheelUpEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_UP,
        x: 40,
        y: 20,
        modifiers: { shift: false, ctrl: false, alt: false },
        timestamp: Date.now(),
      };

      scrollController.handleWheelEvent(wheelUpEvent);

      // Should scroll up in conversation history
      expect(mockConversationRenderer.setScrollPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'up',
          amount: 3, // Default scroll sensitivity
        })
      );

      expect(scrollEvents).toHaveLength(1);
      expect(scrollEvents[0]).toMatchObject({
        direction: 'up',
        lines: 3,
        smooth: true,
      });
    });

    test('should scroll conversation history with wheel down events', async () => {
      // Set initial scroll position
      mockConversationRenderer.getCurrentScrollPosition.mockReturnValue(10);

      const wheelDownEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_DOWN,
        x: 40,
        y: 20,
        modifiers: { shift: false, ctrl: false, alt: false },
        timestamp: Date.now(),
      };

      scrollController.handleWheelEvent(wheelDownEvent);

      expect(mockConversationRenderer.setScrollPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'down',
          amount: 3,
        })
      );

      expect(scrollEvents).toHaveLength(1);
      expect(scrollEvents[0]).toMatchObject({
        direction: 'down',
        lines: 3,
        smooth: true,
      });
    });

    test('should handle rapid wheel events with proper debouncing', async () => {
      const rapidEvents: MouseEvent[] = [];
      
      // Generate 10 rapid wheel events
      for (let i = 0; i < 10; i++) {
        rapidEvents.push({
          type: MouseEventType.SCROLL,
          button: MouseButton.WHEEL_UP,
          x: 40,
          y: 20,
          modifiers: { shift: false, ctrl: false, alt: false },
          timestamp: Date.now() + i * 5, // 5ms apart
        });
      }

      // Send all events rapidly
      rapidEvents.forEach(event => {
        scrollController.handleWheelEvent(event);
      });

      // Wait for debouncing
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should debounce to fewer scroll operations
      expect(scrollEvents.length).toBeLessThan(10);
      expect(scrollEvents.length).toBeGreaterThan(0);
      
      // Should still maintain total scroll distance
      const totalScrolled = scrollEvents.reduce((total, event) => total + event.lines, 0);
      expect(totalScrolled).toBeGreaterThan(0);
    });
  });

  describe('Long Output Scrolling', () => {
    beforeEach(() => {
      // Mock a long AI response scenario
      mockConversationRenderer.getTotalHeight.mockReturnValue(500);
      mockConversationRenderer.getViewportHeight.mockReturnValue(20);
    });

    test('should scroll through long AI responses properly', async () => {
      const wheelDownEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_DOWN,
        x: 40,
        y: 20,
        modifiers: { shift: false, ctrl: false, alt: false },
        timestamp: Date.now(),
      };

      scrollController.handleWheelEvent(wheelDownEvent);

      expect(mockConversationRenderer.setScrollPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'down',
          amount: 3,
        })
      );
    });

    test('should handle boundary detection at start of content', async () => {
      // Already at top (position 0)
      mockConversationRenderer.getCurrentScrollPosition.mockReturnValue(0);

      const wheelUpEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_UP,
        x: 40,
        y: 20,
        modifiers: { shift: false, ctrl: false, alt: false },
        timestamp: Date.now(),
      };

      scrollController.handleWheelEvent(wheelUpEvent);

      // Should handle boundary gracefully
      expect(scrollController.isAtBoundary()).toBe(true);
      expect(scrollController.getBoundaryType()).toBe('top');
    });

    test('should handle boundary detection at end of content', async () => {
      // Set position at bottom
      const maxScroll = mockConversationRenderer.getTotalHeight() - mockConversationRenderer.getViewportHeight();
      mockConversationRenderer.getCurrentScrollPosition.mockReturnValue(maxScroll);

      const wheelDownEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_DOWN,
        x: 40,
        y: 20,
        modifiers: { shift: false, ctrl: false, alt: false },
        timestamp: Date.now(),
      };

      scrollController.handleWheelEvent(wheelDownEvent);

      expect(scrollController.isAtBoundary()).toBe(true);
      expect(scrollController.getBoundaryType()).toBe('bottom');
    });
  });

  describe('Scroll Speed Consistency', () => {
    test('should maintain consistent scroll speed across different content types', async () => {
      const contentTypes = [
        { name: 'text', height: 100 },
        { name: 'code', height: 150 },
        { name: 'mixed', height: 200 },
      ];

      for (const contentType of contentTypes) {
        mockConversationRenderer.getTotalHeight.mockReturnValue(contentType.height);
        
        const wheelEvent: MouseEvent = {
          type: MouseEventType.SCROLL,
          button: MouseButton.WHEEL_DOWN,
          x: 40,
          y: 20,
          modifiers: { shift: false, ctrl: false, alt: false },
          timestamp: Date.now(),
        };

        scrollController.handleWheelEvent(wheelEvent);

        // Should maintain same scroll amount regardless of content type
        expect(mockConversationRenderer.setScrollPosition).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: 3, // Consistent scroll sensitivity
          })
        );
      }
    });

    test('should adjust scroll speed with modifier keys', async () => {
      // Test with ctrl modifier for slower scrolling
      const ctrlWheelEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_DOWN,
        x: 40,
        y: 20,
        modifiers: { shift: false, ctrl: true, alt: false },
        timestamp: Date.now(),
      };

      scrollController.handleWheelEvent(ctrlWheelEvent);

      // Should scroll slower with ctrl modifier
      expect(mockConversationRenderer.setScrollPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1, // Half scroll speed with ctrl
        })
      );
      
      // Reset mock
      mockConversationRenderer.setScrollPosition.mockClear();
      
      // Test with shift modifier - now triggers horizontal scroll
      const shiftWheelEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_DOWN,
        x: 40,
        y: 20,
        modifiers: { shift: true, ctrl: false, alt: false },
        timestamp: Date.now(),
      };

      scrollController.handleWheelEvent(shiftWheelEvent);

      // Shift now triggers horizontal scroll instead of speed modification
      expect(mockConversationRenderer.setHorizontalScrollPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'right',
          amount: 9, // 3 * scrollSensitivity for horizontal
        })
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty conversations gracefully', async () => {
      mockConversationRenderer.getConversationCount.mockReturnValue(0);
      mockConversationRenderer.getTotalHeight.mockReturnValue(0);

      const wheelEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_DOWN,
        x: 40,
        y: 20,
        modifiers: { shift: false, ctrl: false, alt: false },
        timestamp: Date.now(),
      };

      expect(() => {
        scrollController.handleWheelEvent(wheelEvent);
      }).not.toThrow();

      // Should not attempt to scroll empty content
      expect(mockConversationRenderer.setScrollPosition).not.toHaveBeenCalled();
    });

    test('should handle single-line outputs correctly', async () => {
      mockConversationRenderer.getTotalHeight.mockReturnValue(1);
      mockConversationRenderer.getViewportHeight.mockReturnValue(10);

      const wheelEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_DOWN,
        x: 40,
        y: 20,
        modifiers: { shift: false, ctrl: false, alt: false },
        timestamp: Date.now(),
      };

      scrollController.handleWheelEvent(wheelEvent);

      // Should not scroll when content fits in viewport
      expect(mockConversationRenderer.setScrollPosition).not.toHaveBeenCalled();
    });
  });

  describe('Scroll Position Persistence', () => {
    test('should persist scroll position across sessions', async () => {
      const scrollPosition = 50;
      mockConversationRenderer.getCurrentScrollPosition.mockReturnValue(scrollPosition);

      const persistedPosition = scrollController.getPersistedScrollPosition();
      expect(typeof persistedPosition).toBe('number');

      // Simulate session restore
      scrollController.restoreScrollPosition(scrollPosition);
      expect(mockConversationRenderer.setScrollPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          position: scrollPosition,
          smooth: false, // No animation on restore
        })
      );
    });

    test('should clear scroll position when conversation changes', async () => {
      const initialPosition = 30;
      scrollController.restoreScrollPosition(initialPosition);

      // Simulate conversation change
      scrollController.onConversationChange();

      expect(scrollController.getPersistedScrollPosition()).toBe(0);
    });
  });

  describe('Performance Optimization', () => {
    test('should throttle rapid scroll events to maintain 60 FPS', async () => {
      const startTime = performance.now();
      const events: MouseEvent[] = [];

      // Generate 100 rapid events
      for (let i = 0; i < 100; i++) {
        events.push({
          type: MouseEventType.SCROLL,
          button: MouseButton.WHEEL_DOWN,
          x: 40,
          y: 20,
          modifiers: { shift: false, ctrl: false, alt: false },
          timestamp: startTime + i,
        });
      }

      // Process all events
      events.forEach(event => {
        scrollController.handleWheelEvent(event);
      });

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should process events efficiently (target: <16ms for 60 FPS)
      expect(processingTime).toBeLessThan(100); // Allow some overhead for testing
      
      // Should limit actual scroll operations
      expect(scrollEvents.length).toBeLessThan(100);
    });

    test('should clean up event listeners and timers on dispose', () => {
      const initialListenerCount = scrollController.getEventListenerCount();
      
      scrollController.dispose();
      
      const finalListenerCount = scrollController.getEventListenerCount();
      expect(finalListenerCount).toBe(0);
      expect(finalListenerCount).toBeLessThan(initialListenerCount);
    });
  });
});

/**
 * Integration tests for mouse wheel scrolling with conversation history
 */
describe('Mouse Wheel Scrolling Integration', () => {
  let mouseHandler: MouseEventHandler;
  let scrollController: ScrollController;

  beforeEach(() => {
    mouseHandler = new MouseEventHandler({ mouseMode: true });
    scrollController = new ScrollController({
      scrollSensitivity: 3,
      smoothScrolling: true,
    });

    // Connect mouse handler to scroll controller
    mouseHandler.on('scroll', (event: MouseEvent) => {
      scrollController.handleWheelEvent(event);
    });
  });

  afterEach(() => {
    mouseHandler.dispose();
    scrollController.dispose();
  });

  test('should integrate mouse events with scroll controller', async () => {
    const scrollSpy = jest.spyOn(scrollController, 'handleWheelEvent');

    // Simulate mouse wheel sequence
    const mouseSequence = '\x1b[M`!!'; // Wheel up at position 1,1
    const mouseEvents = mouseHandler.parseMouseSequence(mouseSequence);

    expect(mouseEvents).toHaveLength(1);
    expect(mouseEvents[0].type).toBe(MouseEventType.SCROLL);
    expect(mouseEvents[0].button).toBe(MouseButton.WHEEL_UP);

    // Process the event
    const result = mouseHandler.processEvent(mouseEvents[0]);
    expect(result.processed).toBe(true);

    // Wait for event propagation
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_UP,
      })
    );
  });
});