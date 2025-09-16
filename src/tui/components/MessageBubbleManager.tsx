import React, { useState, useEffect, useCallback, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { MessageBubbleProps } from "./MessageBubble";
import { MessageBubbleKeyboardProvider } from "./MessageBubbleKeyboardHandler";

// Performance monitoring interface
interface PerformanceMetrics {
  renderTime: number;
  messageCount: number;
  memoryUsage: number;
  lastUpdate: number;
}

// Component lifecycle events
type LifecycleEvent =
  | "mount"
  | "update"
  | "unmount"
  | "message-added"
  | "message-removed"
  | "message-updated"
  | "scroll"
  | "resize";

// Lifecycle listener interface
interface LifecycleListener {
  event: LifecycleEvent;
  callback: (data?: any) => void;
}

// Manager state interface
interface MessageBubbleManagerState {
  messages: MessageBubbleProps[];
  virtualizedRange: { start: number; end: number };
  scrollPosition: number;
  containerHeight: number;
  performanceMetrics: PerformanceMetrics;
  lifecycleListeners: LifecycleListener[];
  isDisposed: boolean;
}

// Message manager class for lifecycle and performance management
export class MessageBubbleLifecycleManager {
  private state: MessageBubbleManagerState;
  private rafId: number | null = null;
  private performanceObserver: PerformanceObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private cleanupCallbacks: (() => void)[] = [];

  constructor(initialMessages: MessageBubbleProps[] = []) {
    this.state = {
      messages: initialMessages,
      virtualizedRange: { start: 0, end: Math.min(initialMessages.length, 50) },
      scrollPosition: 0,
      containerHeight: 600,
      performanceMetrics: {
        renderTime: 0,
        messageCount: initialMessages.length,
        memoryUsage: 0,
        lastUpdate: Date.now(),
      },
      lifecycleListeners: [],
      isDisposed: false,
    };

    this.initializePerformanceMonitoring();
    this.initializeResizeObserver();
  }

  private initializePerformanceMonitoring() {
    if (typeof PerformanceObserver !== "undefined") {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.name.includes("MessageBubble")) {
            this.updatePerformanceMetrics({
              renderTime: entry.duration,
              lastUpdate: Date.now(),
            });
          }
        });
      });

      this.performanceObserver.observe({ entryTypes: ["measure", "navigation"] });
    }
  }

  private initializeResizeObserver() {
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const newHeight = entry.contentRect.height;
          if (newHeight !== this.state.containerHeight) {
            this.updateContainerHeight(newHeight);
            this.emitLifecycleEvent("resize", { height: newHeight });
          }
        });
      });
    }
  }

  // Add lifecycle event listener
  public addEventListener(event: LifecycleEvent, callback: (data?: any) => void): () => void {
    if (this.state.isDisposed) return () => {};

    const listener: LifecycleListener = { event, callback };
    this.state.lifecycleListeners.push(listener);

    // Return cleanup function
    return () => {
      const index = this.state.lifecycleListeners.indexOf(listener);
      if (index > -1) {
        this.state.lifecycleListeners.splice(index, 1);
      }
    };
  }

  // Emit lifecycle event
  private emitLifecycleEvent(event: LifecycleEvent, data?: any) {
    if (this.state.isDisposed) return;

    this.state.lifecycleListeners
      .filter(listener => listener.event === event)
      .forEach(listener => {
        try {
          listener.callback(data);
        } catch (error) {
          console.warn(`MessageBubble lifecycle event error:`, error);
        }
      });
  }

  // Add message with lifecycle management
  public addMessage(message: MessageBubbleProps): void {
    if (this.state.isDisposed) return;

    performance.mark("MessageBubble-add-start");

    this.state.messages.push(message);
    this.updateVirtualizedRange();
    this.updatePerformanceMetrics({
      messageCount: this.state.messages.length,
      lastUpdate: Date.now(),
    });

    performance.mark("MessageBubble-add-end");
    performance.measure("MessageBubble-add", "MessageBubble-add-start", "MessageBubble-add-end");

    this.emitLifecycleEvent("message-added", { message, index: this.state.messages.length - 1 });
  }

  // Remove message with cleanup
  public removeMessage(index: number): void {
    if (this.state.isDisposed || index < 0 || index >= this.state.messages.length) return;

    const removedMessage = this.state.messages[index];
    this.state.messages.splice(index, 1);
    this.updateVirtualizedRange();
    this.updatePerformanceMetrics({
      messageCount: this.state.messages.length,
      lastUpdate: Date.now(),
    });

    this.emitLifecycleEvent("message-removed", { message: removedMessage, index });
  }

  // Update message with change tracking
  public updateMessage(index: number, updatedMessage: MessageBubbleProps): void {
    if (this.state.isDisposed || index < 0 || index >= this.state.messages.length) return;

    const oldMessage = this.state.messages[index];
    this.state.messages[index] = updatedMessage;
    this.updatePerformanceMetrics({ lastUpdate: Date.now() });

    this.emitLifecycleEvent("message-updated", {
      oldMessage,
      newMessage: updatedMessage,
      index
    });
  }

  // Update virtualized range for performance
  private updateVirtualizedRange(): void {
    const totalMessages = this.state.messages.length;
    const viewportSize = Math.floor(this.state.containerHeight / 80); // Estimate ~80px per message
    const bufferSize = Math.max(5, Math.floor(viewportSize * 0.5));

    const scrollIndex = Math.floor(this.state.scrollPosition / 80);
    const start = Math.max(0, scrollIndex - bufferSize);
    const end = Math.min(totalMessages, scrollIndex + viewportSize + bufferSize);

    this.state.virtualizedRange = { start, end };
  }

  // Update scroll position with virtualization
  public updateScrollPosition(position: number): void {
    if (this.state.isDisposed) return;

    this.state.scrollPosition = position;
    this.updateVirtualizedRange();
    this.emitLifecycleEvent("scroll", { position });
  }

  // Update container height
  private updateContainerHeight(height: number): void {
    this.state.containerHeight = height;
    this.updateVirtualizedRange();
  }

  // Update performance metrics
  private updatePerformanceMetrics(updates: Partial<PerformanceMetrics>): void {
    this.state.performanceMetrics = {
      ...this.state.performanceMetrics,
      ...updates,
    };

    // Update memory usage estimate
    if (typeof performance !== "undefined" && (performance as any).memory) {
      this.state.performanceMetrics.memoryUsage = (performance as any).memory.usedJSHeapSize;
    }
  }

  // Get current state (read-only)
  public getState(): Readonly<MessageBubbleManagerState> {
    return this.state;
  }

  // Get visible messages for rendering
  public getVisibleMessages(): MessageBubbleProps[] {
    const { start, end } = this.state.virtualizedRange;
    return this.state.messages.slice(start, end);
  }

  // Get performance metrics
  public getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.state.performanceMetrics };
  }

  // Dispose and cleanup
  public dispose(): void {
    if (this.state.isDisposed) return;

    this.state.isDisposed = true;

    // Cancel any pending animation frame
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Disconnect observers
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Run cleanup callbacks
    this.cleanupCallbacks.forEach(cleanup => cleanup());
    this.cleanupCallbacks = [];

    // Clear listeners
    this.state.lifecycleListeners = [];

    this.emitLifecycleEvent("unmount");
  }

  // Add cleanup callback
  public addCleanupCallback(callback: () => void): void {
    if (!this.state.isDisposed) {
      this.cleanupCallbacks.push(callback);
    }
  }
}

// React hook for using the lifecycle manager
export const useMessageBubbleManager = (
  initialMessages: MessageBubbleProps[] = []
): {
  manager: MessageBubbleLifecycleManager;
  messages: MessageBubbleProps[];
  visibleMessages: MessageBubbleProps[];
  performanceMetrics: PerformanceMetrics;
  addMessage: (message: MessageBubbleProps) => void;
  removeMessage: (index: number) => void;
  updateMessage: (index: number, message: MessageBubbleProps) => void;
  updateScrollPosition: (position: number) => void;
} => {
  const managerRef = useRef<MessageBubbleLifecycleManager | null>(null);
  const [state, setState] = useState(() => {
    const manager = new MessageBubbleLifecycleManager(initialMessages);
    managerRef.current = manager;
    return manager.getState();
  });

  // Update state when manager state changes
  useEffect(() => {
    if (!managerRef.current) return;

    const manager = managerRef.current;

    const updateState = () => {
      setState(manager.getState());
    };

    // Listen to all lifecycle events for state updates
    const cleanupCallbacks = [
      manager.addEventListener("message-added", updateState),
      manager.addEventListener("message-removed", updateState),
      manager.addEventListener("message-updated", updateState),
      manager.addEventListener("scroll", updateState),
      manager.addEventListener("resize", updateState),
    ];

    return () => {
      cleanupCallbacks.forEach(cleanup => cleanup());
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const manager = managerRef.current;
    return () => {
      if (manager) {
        manager.dispose();
      }
    };
  }, []);

  const manager = managerRef.current!;

  return {
    manager,
    messages: state.messages,
    visibleMessages: manager.getVisibleMessages(),
    performanceMetrics: state.performanceMetrics,
    addMessage: (message: MessageBubbleProps) => manager.addMessage(message),
    removeMessage: (index: number) => manager.removeMessage(index),
    updateMessage: (index: number, message: MessageBubbleProps) =>
      manager.updateMessage(index, message),
    updateScrollPosition: (position: number) => manager.updateScrollPosition(position),
  };
};

// React component wrapper with lifecycle management
export const ManagedMessageBubbleContainer: React.FC<{
  initialMessages?: MessageBubbleProps[];
  height?: number;
  width?: number;
  enableKeyboard?: boolean;
  onPerformanceUpdate?: (metrics: PerformanceMetrics) => void;
  children?: (props: {
    messages: MessageBubbleProps[];
    visibleMessages: MessageBubbleProps[];
    addMessage: (message: MessageBubbleProps) => void;
    removeMessage: (index: number) => void;
    updateMessage: (index: number, message: MessageBubbleProps) => void;
  }) => React.ReactNode;
}> = ({
  initialMessages = [],
  height = 600,
  width = 800,
  enableKeyboard = true,
  onPerformanceUpdate,
  children,
}) => {
  const {
    messages,
    visibleMessages,
    performanceMetrics,
    addMessage,
    removeMessage,
    updateMessage,
    updateScrollPosition,
  } = useMessageBubbleManager(initialMessages);

  // Report performance metrics
  useEffect(() => {
    if (onPerformanceUpdate) {
      onPerformanceUpdate(performanceMetrics);
    }
  }, [performanceMetrics, onPerformanceUpdate]);

  const renderProps = {
    messages,
    visibleMessages,
    addMessage,
    removeMessage,
    updateMessage,
  };

  return (
    <MessageBubbleKeyboardProvider
      messageCount={messages.length}
      keyboardEnabled={enableKeyboard}
    >
      <div
        style={{ height, width, overflow: "auto" }}
        onScroll={(e) => {
          const target = e.target as HTMLElement;
          updateScrollPosition(target.scrollTop);
        }}
      >
        {children ? children(renderProps) : null}
      </div>
    </MessageBubbleKeyboardProvider>
  );
};

export default MessageBubbleLifecycleManager;