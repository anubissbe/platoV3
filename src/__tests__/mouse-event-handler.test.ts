/**
 * Test suite for mouse event handling components
 * Comprehensive tests for mouse support enhancement implementation
 */

import { MouseEventHandler, MouseEvent, MouseEventType, MouseButton } from '../tui/mouse-event-handler';
import { MouseCapabilities } from '../tui/mouse-capabilities';
import { MouseConfiguration } from '../tui/mouse-configuration';

// Mock dependencies
jest.mock('fs/promises');
jest.mock('../config', () => ({
  loadConfig: jest.fn().mockResolvedValue({}),
  setConfigValue: jest.fn().mockResolvedValue(undefined),
}));

describe('MouseEventHandler', () => {
  let mouseHandler: MouseEventHandler;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      mouseMode: true,
      mouseScroll: true,
      mouseClick: true,
      mouseSelection: true,
    };
    mouseHandler = new MouseEventHandler(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const handler = new MouseEventHandler();
      expect(handler.isEnabled()).toBe(true); // Default mouse mode like Claude Code
      expect(handler.getConfiguration().scrollEnabled).toBe(true);
      expect(handler.getConfiguration().clickEnabled).toBe(true);
    });

    test('should initialize with custom configuration', () => {
      const customConfig = {
        mouseMode: false,
        mouseScroll: false,
        mouseClick: true,
        mouseSelection: false,
      };
      const handler = new MouseEventHandler(customConfig);
      expect(handler.isEnabled()).toBe(false);
      expect(handler.getConfiguration().scrollEnabled).toBe(false);
      expect(handler.getConfiguration().clickEnabled).toBe(true);
      expect(handler.getConfiguration().selectionEnabled).toBe(false);
    });

    test('should detect terminal mouse capabilities on init', async () => {
      const handler = new MouseEventHandler();
      await handler.initialize();
      
      const capabilities = handler.getCapabilities();
      expect(capabilities).toBeDefined();
      expect(typeof capabilities.supportsBasicMouse).toBe('boolean');
      expect(typeof capabilities.supportsWheelEvents).toBe('boolean');
      expect(typeof capabilities.supportsDragEvents).toBe('boolean');
    });
  });

  describe('Mouse Event Parsing', () => {
    test('should parse basic mouse click events', () => {
      // Standard mouse click sequence: ESC[M + button + x + y
      const clickSequence = '\x1b[M#!!'; // Left click at position 1,1
      const events = mouseHandler.parseMouseSequence(clickSequence);
      
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: MouseEventType.CLICK,
        button: MouseButton.LEFT,
        x: 1,
        y: 1,
        modifiers: expect.objectContaining({
          shift: false,
          ctrl: false,
          alt: false,
        }),
      });
    });

    test('should parse mouse wheel scroll events', () => {
      // Mouse wheel up: ESC[M` + coordinates
      const scrollUpSequence = '\x1b[M`!!'; // Wheel up at position 1,1
      const events = mouseHandler.parseMouseSequence(scrollUpSequence);
      
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_UP,
        x: 1,
        y: 1,
      });
    });

    test('should parse mouse drag events', () => {
      const dragSequence = '\x1b[M#!!'; // Start drag
      const moveSequence = '\x1b[M#"!'; // Move to new position
      
      const startEvents = mouseHandler.parseMouseSequence(dragSequence);
      expect(startEvents[0].type).toBe(MouseEventType.CLICK);
      
      // Simulate drag state
      mouseHandler.startDrag(startEvents[0]);
      const moveEvents = mouseHandler.parseMouseSequence(moveSequence);
      expect(moveEvents[0].type).toBe(MouseEventType.DRAG);
    });

    test('should handle modifier keys in mouse events', () => {
      // Shift + left click
      const shiftClickSequence = '\x1b[M$!!'; // Shift modifier adds 4 to button code
      const events = mouseHandler.parseMouseSequence(shiftClickSequence);
      
      expect(events[0].modifiers.shift).toBe(true);
      expect(events[0].modifiers.ctrl).toBe(false);
      expect(events[0].modifiers.alt).toBe(false);
    });

    test('should handle invalid mouse sequences gracefully', () => {
      const invalidSequence = '\x1b[Minvalid';
      const events = mouseHandler.parseMouseSequence(invalidSequence);
      
      expect(events).toHaveLength(0);
    });

    test('should parse SGR mouse format', () => {
      // SGR format: ESC[<button;x;y;M
      const sgrSequence = '\x1b[<0;10;5M'; // Left click at 10,5
      const events = mouseHandler.parseMouseSequence(sgrSequence);
      
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: MouseEventType.CLICK,
        button: MouseButton.LEFT,
        x: 10,
        y: 5,
      });
    });
  });

  describe('Event Processing and Filtering', () => {
    test('should filter events based on configuration', () => {
      const config = {
        mouseMode: true,
        mouseScroll: false, // Disable scroll
        mouseClick: true,
        mouseSelection: true,
      };
      const handler = new MouseEventHandler(config);
      
      const scrollEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_UP,
        x: 10,
        y: 10,
        timestamp: Date.now(),
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      const clickEvent: MouseEvent = {
        type: MouseEventType.CLICK,
        button: MouseButton.LEFT,
        x: 10,
        y: 10,
        timestamp: Date.now(),
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      expect(handler.shouldProcessEvent(scrollEvent)).toBe(false);
      expect(handler.shouldProcessEvent(clickEvent)).toBe(true);
    });

    test('should debounce rapid scroll events', async () => {
      const events: MouseEvent[] = [];
      const handler = new MouseEventHandler();
      
      handler.on('scroll', (event) => events.push(event));
      
      // Simulate rapid scroll events
      for (let i = 0; i < 10; i++) {
        const scrollEvent: MouseEvent = {
          type: MouseEventType.SCROLL,
          button: MouseButton.WHEEL_UP,
          x: 10,
          y: 10,
          timestamp: Date.now() + i,
          modifiers: { shift: false, ctrl: false, alt: false },
        };
        handler.processEvent(scrollEvent);
      }
      
      // Should debounce to fewer events
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(events.length).toBeLessThan(10);
      expect(events.length).toBeGreaterThan(0);
    });

    test('should track double-click timing', () => {
      const handler = new MouseEventHandler();
      const clickEvent: MouseEvent = {
        type: MouseEventType.CLICK,
        button: MouseButton.LEFT,
        x: 10,
        y: 10,
        timestamp: Date.now(),
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      handler.processEvent(clickEvent);
      
      // Second click within double-click threshold
      const doubleClickEvent = {
        ...clickEvent,
        timestamp: clickEvent.timestamp + 200, // Within 500ms default threshold
      };
      
      const result = handler.processEvent(doubleClickEvent);
      expect(result.isDoubleClick).toBe(true);
    });
  });

  describe('Event Emission and Listeners', () => {
    test('should emit click events to registered listeners', () => {
      const clickHandler = jest.fn();
      mouseHandler.on('click', clickHandler);
      
      const clickEvent: MouseEvent = {
        type: MouseEventType.CLICK,
        button: MouseButton.LEFT,
        x: 10,
        y: 10,
        timestamp: Date.now(),
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      mouseHandler.processEvent(clickEvent);
      
      expect(clickHandler).toHaveBeenCalledWith(clickEvent);
    });

    test('should emit scroll events with aggregated data', () => {
      const scrollHandler = jest.fn();
      mouseHandler.on('scroll', scrollHandler);
      
      const scrollEvent: MouseEvent = {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_UP,
        x: 10,
        y: 10,
        timestamp: Date.now(),
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      mouseHandler.processEvent(scrollEvent);
      
      expect(scrollHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'up',
          delta: 1,
          x: 10,
          y: 10,
        })
      );
    });

    test('should emit drag events during text selection', () => {
      const dragHandler = jest.fn();
      mouseHandler.on('drag', dragHandler);
      
      const startEvent: MouseEvent = {
        type: MouseEventType.CLICK,
        button: MouseButton.LEFT,
        x: 10,
        y: 10,
        timestamp: Date.now(),
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      const dragEvent: MouseEvent = {
        type: MouseEventType.DRAG,
        button: MouseButton.LEFT,
        x: 15,
        y: 10,
        timestamp: Date.now() + 100,
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      mouseHandler.processEvent(startEvent);
      mouseHandler.startDrag(startEvent);
      mouseHandler.processEvent(dragEvent);
      
      expect(dragHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          startX: 10,
          startY: 10,
          endX: 15,
          endY: 10,
          isSelecting: true,
        })
      );
    });

    test('should remove event listeners', () => {
      const clickHandler = jest.fn();
      mouseHandler.on('click', clickHandler);
      mouseHandler.off('click', clickHandler);
      
      const clickEvent: MouseEvent = {
        type: MouseEventType.CLICK,
        button: MouseButton.LEFT,
        x: 10,
        y: 10,
        timestamp: Date.now(),
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      mouseHandler.processEvent(clickEvent);
      
      expect(clickHandler).not.toHaveBeenCalled();
    });
  });

  describe('Performance and Resource Management', () => {
    test('should maintain performance under high event frequency', () => {
      const handler = new MouseEventHandler();
      const startTime = Date.now();
      const eventCount = 1000;
      
      // Generate high-frequency events
      for (let i = 0; i < eventCount; i++) {
        const event: MouseEvent = {
          type: MouseEventType.SCROLL,
          button: MouseButton.WHEEL_UP,
          x: 10,
          y: 10,
          timestamp: Date.now() + i,
          modifiers: { shift: false, ctrl: false, alt: false },
        };
        handler.processEvent(event);
      }
      
      const processingTime = Date.now() - startTime;
      
      // Should process 1000 events in under 100ms (target: <5ms per event)
      expect(processingTime).toBeLessThan(100);
    });

    test('should limit memory usage with event history cleanup', () => {
      const handler = new MouseEventHandler();
      
      // Generate many events to test memory management
      for (let i = 0; i < 10000; i++) {
        const event: MouseEvent = {
          type: MouseEventType.CLICK,
          button: MouseButton.LEFT,
          x: i % 100,
          y: i % 50,
          timestamp: Date.now() + i,
          modifiers: { shift: false, ctrl: false, alt: false },
        };
        handler.processEvent(event);
      }
      
      // Check that event history is limited to prevent memory leaks
      const eventHistory = handler.getEventHistory();
      expect(eventHistory.length).toBeLessThanOrEqual(1000); // Max history limit
    });

    test('should cleanup resources on dispose', () => {
      const handler = new MouseEventHandler();
      const cleanupSpy = jest.spyOn(handler, 'dispose');
      
      handler.dispose();
      
      expect(cleanupSpy).toHaveBeenCalled();
      expect(handler.getEventListeners().size).toBe(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed terminal sequences', () => {
      const handler = new MouseEventHandler();
      const malformedSequences = [
        '\x1b[M', // Incomplete
        '\x1b[M\x00\x00\x00', // Invalid coordinates
        '\x1b[<invalid', // Invalid SGR format
        'random text', // Not a mouse sequence
      ];
      
      malformedSequences.forEach(sequence => {
        expect(() => {
          handler.parseMouseSequence(sequence);
        }).not.toThrow();
      });
    });

    test('should handle events when mouse mode is disabled', () => {
      const config = { mouseMode: false };
      const handler = new MouseEventHandler(config);
      
      const clickEvent: MouseEvent = {
        type: MouseEventType.CLICK,
        button: MouseButton.LEFT,
        x: 10,
        y: 10,
        timestamp: Date.now(),
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      const result = handler.processEvent(clickEvent);
      expect(result.processed).toBe(false);
    });

    test('should handle coordinate overflow gracefully', () => {
      const handler = new MouseEventHandler();
      
      const overflowEvent: MouseEvent = {
        type: MouseEventType.CLICK,
        button: MouseButton.LEFT,
        x: 99999, // Very large coordinate
        y: 99999,
        timestamp: Date.now(),
        modifiers: { shift: false, ctrl: false, alt: false },
      };
      
      expect(() => {
        handler.processEvent(overflowEvent);
      }).not.toThrow();
    });
  });
});

describe('MouseCapabilities', () => {
  let capabilities: MouseCapabilities;

  beforeEach(() => {
    capabilities = new MouseCapabilities();
  });

  describe('Platform Detection', () => {
    test('should detect Windows terminal capabilities', async () => {
      // Mock Windows environment
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.TERM_PROGRAM = 'WindowsTerminal';
      
      const caps = await capabilities.detect();
      
      expect(caps.platform).toBe('win32');
      expect(caps.terminal).toBe('WindowsTerminal');
      expect(typeof caps.supportsBasicMouse).toBe('boolean');
    });

    test('should detect macOS terminal capabilities', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      process.env.TERM_PROGRAM = 'iTerm.app';
      
      const caps = await capabilities.detect();
      
      expect(caps.platform).toBe('darwin');
      expect(caps.terminal).toBe('iTerm.app');
      expect(caps.supportsBasicMouse).toBe(true); // iTerm has good mouse support
    });

    test('should detect Linux terminal capabilities', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.TERM = 'xterm-256color';
      
      const caps = await capabilities.detect();
      
      expect(caps.platform).toBe('linux');
      expect(caps.terminal).toContain('xterm');
    });

    test('should detect WSL environment', async () => {
      process.env.WSL_DISTRO_NAME = 'Ubuntu';
      
      const caps = await capabilities.detect();
      
      expect(caps.isWSL).toBe(true);
      expect(caps.limitedSupport).toBe(true); // WSL has limited mouse support
    });
  });

  describe('Feature Support Detection', () => {
    test('should check mouse tracking support', async () => {
      const caps = await capabilities.detect();
      
      expect(typeof caps.supportsBasicMouse).toBe('boolean');
      expect(typeof caps.supportsWheelEvents).toBe('boolean');
      expect(typeof caps.supportsDragEvents).toBe('boolean');
      expect(typeof caps.supportsSGRMode).toBe('boolean');
    });

    test('should provide fallback capabilities for unsupported terminals', async () => {
      // Mock unsupported terminal
      process.env.TERM = 'dumb';
      delete process.env.TERM_PROGRAM;
      
      const caps = await capabilities.detect();
      
      expect(caps.supportsBasicMouse).toBe(false);
      expect(caps.fallbackMode).toBe(true);
    });
  });
});

describe('MouseConfiguration', () => {
  let config: MouseConfiguration;

  beforeEach(() => {
    config = new MouseConfiguration();
  });

  describe('Configuration Management', () => {
    test('should load default configuration', async () => {
      await config.load();
      
      expect(config.get('mouseMode')).toBe(true); // Default like Claude Code
      expect(config.get('scrollEnabled')).toBe(true);
      expect(config.get('clickEnabled')).toBe(true);
      expect(config.get('selectionEnabled')).toBe(true);
    });

    test('should save and load configuration', async () => {
      config.set('mouseMode', false);
      config.set('scrollSensitivity', 5);
      
      await config.save();
      
      const newConfig = new MouseConfiguration();
      await newConfig.load();
      
      expect(newConfig.get('mouseMode')).toBe(false);
      expect(newConfig.get('scrollSensitivity')).toBe(5);
    });

    test('should validate configuration values', () => {
      expect(() => config.set('scrollSensitivity', -1)).toThrow();
      expect(() => config.set('scrollSensitivity', 11)).toThrow();
      expect(() => config.set('doubleClickThreshold', 0)).toThrow();
    });

    test('should provide default values for missing keys', () => {
      expect(config.get('nonexistentKey', 'default')).toBe('default');
    });
  });

  describe('Platform-Specific Defaults', () => {
    test('should adjust defaults for different platforms', async () => {
      // Mock different platform
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      await config.load();
      
      // Windows might have different default sensitivity
      const scrollSensitivity = config.get('scrollSensitivity');
      expect(typeof scrollSensitivity).toBe('number');
      expect(scrollSensitivity).toBeGreaterThan(0);
    });
  });
});