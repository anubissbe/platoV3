/**
 * RenderOptimizer - Optimizations for reducing re-render frequency and scope
 * Implements throttling, debouncing, and selective updates
 */

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';

/**
 * Hook for throttling updates to achieve target FPS
 */
export function useThrottledUpdate<T>(
  value: T,
  delay: number = 16 // ~60fps
): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdate = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdate.current;

    if (timeSinceLastUpdate >= delay) {
      setThrottledValue(value);
      lastUpdate.current = now;
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        setThrottledValue(value);
        lastUpdate.current = Date.now();
      }, delay - timeSinceLastUpdate);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return throttledValue;
}

/**
 * Hook for debouncing updates to prevent rapid re-renders
 */
export function useDebouncedUpdate<T>(
  value: T,
  delay: number = 100
): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for batching multiple updates into a single render
 */
export function useBatchedUpdates<T extends Record<string, any>>(
  initialState: T
): [T, (updates: Partial<T>) => void] {
  const [state, setState] = useState(initialState);
  const pendingUpdates = useRef<Partial<T>>({});
  const updateTimer = useRef<NodeJS.Timeout>();

  const batchUpdate = useCallback((updates: Partial<T>) => {
    pendingUpdates.current = { ...pendingUpdates.current, ...updates };

    if (updateTimer.current) {
      clearTimeout(updateTimer.current);
    }

    // Use requestAnimationFrame timing for smooth updates
    updateTimer.current = setTimeout(() => {
      setState(prevState => ({
        ...prevState,
        ...pendingUpdates.current
      }));
      pendingUpdates.current = {};
    }, 0);
  }, []);

  useEffect(() => {
    return () => {
      if (updateTimer.current) {
        clearTimeout(updateTimer.current);
      }
    };
  }, []);

  return [state, batchUpdate];
}

/**
 * Hook for selective component updates based on dependencies
 */
export function useSelectiveUpdate<T>(
  value: T,
  shouldUpdate: (prev: T, next: T) => boolean
): T {
  const [currentValue, setCurrentValue] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (shouldUpdate(prevValue.current, value)) {
      setCurrentValue(value);
      prevValue.current = value;
    }
  }, [value, shouldUpdate]);

  return currentValue;
}

/**
 * Hook for frame-based updates synchronized with browser paint
 */
export function useFrameUpdate(
  callback: (deltaTime: number) => void,
  deps: React.DependencyList = []
) {
  const frameRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTimeRef.current;
      
      // Limit to 60fps (16.67ms per frame)
      if (deltaTime >= 16.67) {
        callback(deltaTime);
        lastTimeRef.current = currentTime;
      }
      
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, deps);
}

/**
 * Hook for lazy loading components based on viewport visibility
 */
export function useLazyLoad(
  threshold: number = 100
): [boolean, (element: HTMLElement | null) => void] {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver>();

  const setRef = useCallback((element: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (element) {
      elementRef.current = element;
      
      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          setIsVisible(entry.isIntersecting);
        },
        {
          rootMargin: `${threshold}px`
        }
      );
      
      observerRef.current.observe(element);
    }
  }, [threshold]);

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return [isVisible, setRef];
}

/**
 * Optimization context for managing render optimizations globally
 */
export interface OptimizationConfig {
  targetFPS: number;
  enableThrottling: boolean;
  enableDebouncing: boolean;
  enableBatching: boolean;
  enableLazyLoading: boolean;
  throttleDelay: number;
  debounceDelay: number;
}

export const defaultOptimizationConfig: OptimizationConfig = {
  targetFPS: 60,
  enableThrottling: true,
  enableDebouncing: true,
  enableBatching: true,
  enableLazyLoading: true,
  throttleDelay: 16, // ~60fps
  debounceDelay: 100
};

/**
 * Hook for optimized scroll handling
 */
export function useOptimizedScroll(
  onScroll: (position: number, direction: 'up' | 'down') => void,
  threshold: number = 5
) {
  const lastPosition = useRef(0);
  const ticking = useRef(false);

  const handleScroll = useCallback((position: number) => {
    if (!ticking.current) {
      requestAnimationFrame(() => {
        const direction = position > lastPosition.current ? 'down' : 'up';
        const delta = Math.abs(position - lastPosition.current);
        
        // Only trigger if scroll delta exceeds threshold
        if (delta >= threshold) {
          onScroll(position, direction);
          lastPosition.current = position;
        }
        
        ticking.current = false;
      });
      
      ticking.current = true;
    }
  }, [onScroll, threshold]);

  return handleScroll;
}

/**
 * Hook for optimized resize handling
 */
export function useOptimizedResize(
  onResize: (width: number, height: number) => void,
  debounceDelay: number = 100
) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastSize = useRef({ width: 0, height: 0 });

  const handleResize = useCallback((width: number, height: number) => {
    // Quick check to avoid unnecessary updates
    if (width === lastSize.current.width && height === lastSize.current.height) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      onResize(width, height);
      lastSize.current = { width, height };
    }, debounceDelay);
  }, [onResize, debounceDelay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return handleResize;
}

/**
 * Performance optimization utilities
 */
export const PerformanceUtils = {
  /**
   * Check if we should skip render based on FPS target
   */
  shouldSkipRender: (lastRenderTime: number, targetFPS: number = 60): boolean => {
    const minFrameTime = 1000 / targetFPS;
    const timeSinceLastRender = Date.now() - lastRenderTime;
    return timeSinceLastRender < minFrameTime;
  },

  /**
   * Calculate optimal batch size based on performance
   */
  getOptimalBatchSize: (itemCount: number, targetFPS: number = 60): number => {
    const baseSize = 10;
    const scaleFactor = targetFPS / 60;
    return Math.max(1, Math.floor(baseSize * scaleFactor));
  },

  /**
   * Measure function execution time
   */
  measurePerformance: <T>(fn: () => T, label?: string): T => {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    if (label && duration > 16.67) {
      console.warn(`[Performance] ${label} took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  }
};

export default {
  useThrottledUpdate,
  useDebouncedUpdate,
  useBatchedUpdates,
  useSelectiveUpdate,
  useFrameUpdate,
  useLazyLoad,
  useOptimizedScroll,
  useOptimizedResize,
  PerformanceUtils
};