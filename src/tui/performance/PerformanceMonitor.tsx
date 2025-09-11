/**
 * PerformanceMonitor - Real-time performance monitoring for TUI components
 * Tracks FPS, render times, and memory usage
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Box, Text } from 'ink';

export interface PerformanceMetrics {
  fps: number;
  renderTime: number;
  memoryUsage: number;
  componentCount: number;
  updateCount: number;
  lastUpdate: number;
}

export interface PerformanceMonitorProps {
  enabled?: boolean;
  targetFPS?: number;
  onMetricsUpdate?: (metrics: PerformanceMetrics) => void;
  showOverlay?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * Performance monitoring component with FPS tracking
 */
export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  enabled = true,
  targetFPS = 60,
  onMetricsUpdate,
  showOverlay = false,
  position = 'top-right'
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    renderTime: 0,
    memoryUsage: 0,
    componentCount: 0,
    updateCount: 0,
    lastUpdate: Date.now()
  });

  const frameCount = useRef(0);
  const lastFrameTime = useRef(Date.now());
  const renderTimes = useRef<number[]>([]);
  const animationFrameId = useRef<number | null>(null);

  // FPS calculation
  const calculateFPS = useCallback(() => {
    const now = Date.now();
    const delta = now - lastFrameTime.current;
    
    if (delta >= 1000) {
      const fps = Math.round((frameCount.current * 1000) / delta);
      frameCount.current = 0;
      lastFrameTime.current = now;
      
      // Calculate average render time
      const avgRenderTime = renderTimes.current.length > 0
        ? renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length
        : 0;
      
      // Get memory usage if available
      const memoryUsage = (performance as any).memory
        ? Math.round((performance as any).memory.usedJSHeapSize / 1048576)
        : 0;
      
      const newMetrics: PerformanceMetrics = {
        fps,
        renderTime: Math.round(avgRenderTime * 100) / 100,
        memoryUsage,
        componentCount: metrics.componentCount,
        updateCount: metrics.updateCount + 1,
        lastUpdate: now
      };
      
      setMetrics(newMetrics);
      onMetricsUpdate?.(newMetrics);
      
      // Clear render times for next second
      renderTimes.current = [];
    }
    
    frameCount.current++;
    
    if (enabled) {
      animationFrameId.current = requestAnimationFrame(calculateFPS);
    }
  }, [enabled, metrics.componentCount, metrics.updateCount, onMetricsUpdate]);

  // Start FPS monitoring
  useEffect(() => {
    if (enabled) {
      animationFrameId.current = requestAnimationFrame(calculateFPS);
    }
    
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [enabled, calculateFPS]);

  // Track render time
  const trackRenderTime = useCallback((renderTime: number) => {
    renderTimes.current.push(renderTime);
    
    // Keep only last 60 samples
    if (renderTimes.current.length > 60) {
      renderTimes.current.shift();
    }
  }, []);

  // Performance status color
  const getFPSColor = (fps: number): string => {
    if (fps >= targetFPS) return 'green';
    if (fps >= targetFPS * 0.8) return 'yellow';
    return 'red';
  };

  if (!enabled || !showOverlay) {
    return null;
  }

  // Position styles
  const getPositionStyles = () => {
    switch (position) {
      case 'top-left':
        return { position: 'absolute' as const, top: 0, left: 0 };
      case 'top-right':
        return { position: 'absolute' as const, top: 0, right: 0 };
      case 'bottom-left':
        return { position: 'absolute' as const, bottom: 0, left: 0 };
      case 'bottom-right':
        return { position: 'absolute' as const, bottom: 0, right: 0 };
    }
  };

  return (
    <Box {...getPositionStyles()} borderStyle="single" padding={1}>
      <Box flexDirection="column">
        <Text color={getFPSColor(metrics.fps)} bold>
          FPS: {metrics.fps}/{targetFPS}
        </Text>
        <Text color="gray">
          Render: {metrics.renderTime}ms
        </Text>
        {metrics.memoryUsage > 0 && (
          <Text color="gray">
            Memory: {metrics.memoryUsage}MB
          </Text>
        )}
      </Box>
    </Box>
  );
};

/**
 * Hook to track component render performance
 */
export const useRenderPerformance = (componentName: string) => {
  const renderStart = useRef<number | null>(null);
  const renderCount = useRef(0);

  useEffect(() => {
    renderStart.current = performance.now();
    
    return () => {
      if (renderStart.current) {
        const renderTime = performance.now() - renderStart.current;
        
        // Log slow renders
        if (renderTime > 16.67) { // Slower than 60fps
          console.warn(`Slow render in ${componentName}: ${renderTime.toFixed(2)}ms`);
        }
      }
    };
  });

  renderCount.current++;

  return {
    renderCount: renderCount.current,
    measureRender: () => {
      renderStart.current = performance.now();
      return () => {
        if (renderStart.current) {
          return performance.now() - renderStart.current;
        }
        return 0;
      };
    }
  };
};

/**
 * Performance optimization wrapper component
 */
export interface PerformanceWrapperProps {
  children: React.ReactNode;
  name: string;
  threshold?: number; // ms threshold for slow render warning
  onSlowRender?: (name: string, time: number) => void;
}

export const PerformanceWrapper: React.FC<PerformanceWrapperProps> = ({
  children,
  name,
  threshold = 16.67,
  onSlowRender
}) => {
  const renderStart = performance.now();

  useEffect(() => {
    const renderTime = performance.now() - renderStart;
    
    if (renderTime > threshold) {
      onSlowRender?.(name, renderTime);
      
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[Performance] ${name} rendered in ${renderTime.toFixed(2)}ms (target: ${threshold}ms)`);
      }
    }
  });

  return <>{children}</>;
};

export default PerformanceMonitor;