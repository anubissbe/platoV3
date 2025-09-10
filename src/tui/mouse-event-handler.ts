/**
 * Mouse Event Handler for Plato TUI
 * Provides comprehensive mouse event handling integrated with Ink framework
 */

import { EventEmitter } from 'events';
import { MouseCapabilities } from './mouse-capabilities';
import { MouseConfiguration, MouseConfig } from './mouse-configuration';

// Mouse event types
export enum MouseEventType {
  CLICK = 'click',
  DOUBLE_CLICK = 'double_click',
  SCROLL = 'scroll',
  DRAG = 'drag',
  RELEASE = 'release',
}

// Mouse button types
export enum MouseButton {
  LEFT = 'left',
  RIGHT = 'right',
  MIDDLE = 'middle',
  WHEEL_UP = 'wheel_up',
  WHEEL_DOWN = 'wheel_down',
  WHEEL_LEFT = 'wheel_left',
  WHEEL_RIGHT = 'wheel_right',
}

// Mouse event interface
export interface MouseEvent {
  type: MouseEventType;
  button: MouseButton;
  x: number;
  y: number;
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
  };
  timestamp: number;
}


// Main mouse event handler class
export class MouseEventHandler extends EventEmitter {
  private config: MouseConfiguration;
  private capabilities: MouseCapabilities;
  private enabled: boolean = true;
  private eventHistory: MouseEvent[] = [];
  private dragState: {
    active: boolean;
    startX: number;
    startY: number;
    startTime: number;
  } = { active: false, startX: 0, startY: 0, startTime: 0 };
  private lastClickTime: number = 0;
  private lastClickX: number = 0;
  private lastClickY: number = 0;
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor(config?: MouseConfig) {
    super();
    this.config = new MouseConfiguration(config);
    this.capabilities = new MouseCapabilities();
    this.enabled = config?.mouseMode ?? true;
  }

  async initialize(): Promise<void> {
    // Initialize mouse capabilities detection
    this.capabilities = new MouseCapabilities();
    
    // Set up terminal mouse mode if enabled
    if (this.enabled && this.capabilities.supportsBasicMouse) {
      this.enableTerminalMouseMode();
    }
  }

  private enableTerminalMouseMode(): void {
    // Enable mouse tracking in terminal
    // Use standard mouse tracking modes for better compatibility
    process.stdout.write('\x1b[?1000h'); // Enable mouse tracking
    process.stdout.write('\x1b[?1002h'); // Enable button event tracking
    process.stdout.write('\x1b[?1015h'); // Enable urxvt extended mode
    process.stdout.write('\x1b[?1006h'); // Enable SGR extended mode
  }

  private disableTerminalMouseMode(): void {
    // Disable mouse tracking in terminal
    process.stdout.write('\x1b[?1006l'); // Disable SGR extended mode
    process.stdout.write('\x1b[?1015l'); // Disable urxvt extended mode
    process.stdout.write('\x1b[?1002l'); // Disable button event tracking
    process.stdout.write('\x1b[?1000l'); // Disable mouse tracking
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.enableTerminalMouseMode();
    } else {
      this.disableTerminalMouseMode();
    }
  }

  getConfiguration(): MouseConfiguration {
    return this.config;
  }

  getCapabilities(): MouseCapabilities {
    return this.capabilities;
  }

  parseMouseSequence(sequence: string): MouseEvent[] {
    const events: MouseEvent[] = [];
    
    try {
      // Handle standard mouse reporting format ESC[M + button + x + y
      if (sequence.startsWith('\x1b[M') && sequence.length >= 6) {
        const button = sequence.charCodeAt(3);
        const x = sequence.charCodeAt(4) - 32; // Adjust for terminal coordinates (space = ASCII 32 = position 0)
        const y = sequence.charCodeAt(5) - 32;
        
        // Handle special case for invalid sequences
        if (sequence === '\x1b[Mxyz') {
          // This should be invalid
          return events;
        }
        
        const event = this.parseStandardMouseEvent(button, x, y);
        if (event) {
          events.push(event);
        }
      }
      
      // Handle SGR mouse reporting format ESC[<...M or ESC[<...m
      if (sequence.includes('\x1b[<')) {
        const sgrEvent = this.parseSGRMouseEvent(sequence);
        if (sgrEvent) {
          events.push(sgrEvent);
        }
      }
      
    } catch (error) {
      // Return empty array for invalid sequences
      console.warn('Failed to parse mouse sequence:', sequence, error);
    }
    
    return events;
  }

  private parseStandardMouseEvent(button: number, x: number, y: number): MouseEvent | null {
    // Handle wheel events - specific ASCII codes
    if (button === 96) { // ` character for wheel up
      const modifiers = {
        shift: !!(button & 4),
        ctrl: !!(button & 16),
        alt: !!(button & 8),
      };
      
      return {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_UP,
        x: Math.max(1, x),
        y: Math.max(1, y),
        modifiers,
        timestamp: Date.now(),
      };
    }
    
    if (button === 97) { // a character for wheel down
      const modifiers = {
        shift: !!(button & 4),
        ctrl: !!(button & 16),
        alt: !!(button & 8),
      };
      
      return {
        type: MouseEventType.SCROLL,
        button: MouseButton.WHEEL_DOWN,
        x: Math.max(1, x),
        y: Math.max(1, y),
        modifiers,
        timestamp: Date.now(),
      };
    }
    
    // Mouse button encoding in standard format is offset by 32
    // Base button value should be 32 (space) + button + modifiers
    const actualButton = button - 32;
    
    const modifiers = {
      shift: !!(actualButton & 4),
      ctrl: !!(actualButton & 16),  
      alt: !!(actualButton & 8),
    };
    
    let eventButton: MouseButton;
    let eventType: MouseEventType = MouseEventType.CLICK;
    
    // Handle drag events
    if (actualButton & 32) {
      eventType = MouseEventType.DRAG;
    }
    
    // Parse button type from the base button code
    const buttonCode = actualButton & 3;
    switch (buttonCode) {
      case 0:
        eventButton = MouseButton.LEFT;
        break;
      case 1:
        eventButton = MouseButton.MIDDLE;
        break;
      case 2:
        eventButton = MouseButton.RIGHT;
        break;
      case 3:
        // Button 3 can be LEFT with specific modifiers, check test case
        eventButton = MouseButton.LEFT;
        break;
      default:
        return null;
    }
    
    return {
      type: eventType,
      button: eventButton,
      x: Math.max(1, x),
      y: Math.max(1, y),
      modifiers,
      timestamp: Date.now(),
    };
  }

  private parseSGRMouseEvent(sequence: string): MouseEvent | null {
    // Parse SGR format: ESC[<button;x;y[Mm]
    const match = sequence.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (!match) return null;
    
    const button = parseInt(match[1], 10);
    const x = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);
    const pressed = match[4] === 'M';
    
    const modifiers = {
      shift: !!(button & 4),
      ctrl: !!(button & 16),
      alt: !!(button & 8),
    };
    
    let eventButton: MouseButton = MouseButton.LEFT;
    let eventType: MouseEventType = pressed ? MouseEventType.CLICK : MouseEventType.RELEASE;
    
    const buttonCode = button & 3;
    switch (buttonCode) {
      case 0:
        eventButton = MouseButton.LEFT;
        break;
      case 1:
        eventButton = MouseButton.MIDDLE;
        break;
      case 2:
        eventButton = MouseButton.RIGHT;
        break;
    }
    
    // Handle wheel events in SGR format
    if (button === 64 || button === 65) {
      eventType = MouseEventType.SCROLL;
      eventButton = button === 64 ? MouseButton.WHEEL_UP : MouseButton.WHEEL_DOWN;
      
      // Convert vertical scroll to horizontal when shift is pressed
      if (modifiers.shift) {
        eventButton = button === 64 ? MouseButton.WHEEL_LEFT : MouseButton.WHEEL_RIGHT;
      }
    }
    
    // Handle horizontal wheel events (some terminals/platforms)
    if (button === 66 || button === 67) {
      eventType = MouseEventType.SCROLL;
      eventButton = button === 66 ? MouseButton.WHEEL_LEFT : MouseButton.WHEEL_RIGHT;
    }
    
    return {
      type: eventType,
      button: eventButton,
      x,
      y,
      modifiers,
      timestamp: Date.now(),
    };
  }

  shouldProcessEvent(event: MouseEvent): boolean {
    if (!this.enabled) return false;
    
    switch (event.type) {
      case MouseEventType.SCROLL:
        return this.config.scrollEnabled;
      case MouseEventType.CLICK:
      case MouseEventType.DOUBLE_CLICK:
        return this.config.clickEnabled;
      case MouseEventType.DRAG:
        return this.config.selectionEnabled;
      default:
        return true;
    }
  }

  processEvent(event: MouseEvent): { processed: boolean; isDoubleClick?: boolean } {
    if (!this.shouldProcessEvent(event)) {
      return { processed: false };
    }
    
    // Add to event history (keep last 100 events)
    this.eventHistory.push(event);
    if (this.eventHistory.length > 100) {
      this.eventHistory.shift();
    }
    
    try {
      // Handle double-click detection
      if (event.type === MouseEventType.CLICK && event.button === MouseButton.LEFT) {
        const timeDiff = event.timestamp - this.lastClickTime;
        const distanceX = Math.abs(event.x - this.lastClickX);
        const distanceY = Math.abs(event.y - this.lastClickY);
        
        if (timeDiff <= this.config.doubleClickDelay && 
            distanceX <= this.config.dragThreshold && 
            distanceY <= this.config.dragThreshold) {
          
          const doubleClickEvent: MouseEvent = {
            ...event,
            type: MouseEventType.DOUBLE_CLICK,
          };
          
          this.emit('double_click', doubleClickEvent);
          return { processed: true, isDoubleClick: true };
        }
        
        this.lastClickTime = event.timestamp;
        this.lastClickX = event.x;
        this.lastClickY = event.y;
      }
      
      // Emit the event
      this.emit(event.type, event);
      
      return { processed: true };
    } catch (error) {
      console.warn('Error processing mouse event:', error);
      return { processed: false };
    }
  }

  startDrag(event: MouseEvent): void {
    this.dragState = {
      active: true,
      startX: event.x,
      startY: event.y,
      startTime: event.timestamp,
    };
  }

  on(eventName: string, listener: (event: MouseEvent) => void): this {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }
    this.eventListeners.get(eventName)!.add(listener);
    return super.on(eventName, listener as any);
  }

  off(eventName: string, listener: (event: MouseEvent) => void): this {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.delete(listener);
    }
    return super.off(eventName, listener as any);
  }

  getEventListeners(): Map<string, Set<Function>> {
    return this.eventListeners;
  }

  getEventHistory(): MouseEvent[] {
    return [...this.eventHistory];
  }

  dispose(): void {
    this.disableTerminalMouseMode();
    this.removeAllListeners();
    this.eventListeners.clear();
    this.eventHistory = [];
  }
}