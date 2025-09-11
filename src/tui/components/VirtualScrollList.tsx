/**
 * VirtualScrollList - High-performance virtual scrolling component
 * Optimized for rendering large lists with consistent 60fps performance
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Box } from 'ink';

export interface VirtualScrollItem {
  id: string;
  height?: number; // Optional fixed height, otherwise calculated
  content: React.ReactNode;
}

export interface VirtualScrollListProps<T extends VirtualScrollItem> {
  items: T[];
  height: number; // Viewport height
  width?: number;
  itemHeight?: number; // Fixed item height (for optimization)
  overscan?: number; // Number of items to render outside viewport
  scrollPosition?: number;
  onScroll?: (position: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  estimatedItemHeight?: number; // For dynamic heights
  cacheSize?: number; // Number of height measurements to cache
}

interface ScrollMetrics {
  visibleStartIndex: number;
  visibleEndIndex: number;
  offsetY: number;
  totalHeight: number;
}

/**
 * High-performance virtual scrolling list component
 */
export function VirtualScrollList<T extends VirtualScrollItem>({
  items,
  height: viewportHeight,
  width,
  itemHeight,
  overscan = 3,
  scrollPosition = 0,
  onScroll,
  renderItem,
  estimatedItemHeight = 3,
  cacheSize = 100
}: VirtualScrollListProps<T>) {
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({
    visibleStartIndex: 0,
    visibleEndIndex: 0,
    offsetY: 0,
    totalHeight: 0
  });

  // Height cache for dynamic item heights
  const heightCache = useRef<Map<string, number>>(new Map());
  const measuredHeights = useRef<Map<string, number>>(new Map());
  
  // Performance optimization: batch height updates
  const pendingHeightUpdates = useRef<Map<string, number>>(new Map());
  const heightUpdateTimer = useRef<NodeJS.Timeout | null>(null);

  // Calculate item position and height
  const getItemMetrics = useCallback((index: number): { offset: number; height: number } => {
    const item = items[index];
    if (!item) return { offset: 0, height: 0 };

    // Use fixed height if available
    if (itemHeight) {
      return {
        offset: index * itemHeight,
        height: itemHeight
      };
    }

    // Use cached height or estimate
    const cachedHeight = heightCache.current.get(item.id) || 
                        item.height || 
                        estimatedItemHeight;

    // Calculate offset by summing previous item heights
    let offset = 0;
    for (let i = 0; i < index; i++) {
      const prevItem = items[i];
      if (prevItem) {
        offset += heightCache.current.get(prevItem.id) || 
                 prevItem.height || 
                 estimatedItemHeight;
      }
    }

    return { offset, height: cachedHeight };
  }, [items, itemHeight, estimatedItemHeight]);

  // Calculate visible range with overscan
  const calculateVisibleRange = useCallback((): ScrollMetrics => {
    let startIndex = 0;
    let endIndex = items.length - 1;
    let accumulatedHeight = 0;
    let offsetY = 0;
    let foundStart = false;

    // Find visible start index
    for (let i = 0; i < items.length; i++) {
      const { height } = getItemMetrics(i);
      
      if (!foundStart && accumulatedHeight + height > scrollPosition) {
        startIndex = Math.max(0, i - overscan);
        offsetY = accumulatedHeight;
        foundStart = true;
      }
      
      if (accumulatedHeight > scrollPosition + viewportHeight) {
        endIndex = Math.min(items.length - 1, i + overscan);
        break;
      }
      
      accumulatedHeight += height;
    }

    return {
      visibleStartIndex: startIndex,
      visibleEndIndex: endIndex,
      offsetY,
      totalHeight: accumulatedHeight
    };
  }, [items, scrollPosition, viewportHeight, overscan, getItemMetrics]);

  // Update scroll metrics when dependencies change
  useEffect(() => {
    const metrics = calculateVisibleRange();
    setScrollMetrics(metrics);
  }, [calculateVisibleRange]);

  // Batch height updates for performance
  const updateItemHeight = useCallback((itemId: string, height: number) => {
    pendingHeightUpdates.current.set(itemId, height);
    
    // Clear existing timer
    if (heightUpdateTimer.current) {
      clearTimeout(heightUpdateTimer.current);
    }
    
    // Batch updates with requestAnimationFrame timing
    heightUpdateTimer.current = setTimeout(() => {
      pendingHeightUpdates.current.forEach((h, id) => {
        const currentHeight = heightCache.current.get(id);
        if (currentHeight !== h) {
          heightCache.current.set(id, h);
          
          // Maintain cache size limit
          if (heightCache.current.size > cacheSize) {
            const firstKey = heightCache.current.keys().next().value;
            if (firstKey) heightCache.current.delete(firstKey);
          }
        }
      });
      
      pendingHeightUpdates.current.clear();
      
      // Trigger recalculation
      const metrics = calculateVisibleRange();
      setScrollMetrics(metrics);
    }, 16); // ~60fps
  }, [cacheSize, calculateVisibleRange]);

  // Memoize visible items for performance
  const visibleItems = useMemo(() => {
    const { visibleStartIndex, visibleEndIndex } = scrollMetrics;
    return items.slice(visibleStartIndex, visibleEndIndex + 1);
  }, [items, scrollMetrics]);

  // Render optimized item with height measurement
  const renderOptimizedItem = useCallback((item: T, index: number) => {
    const itemElement = renderItem(item, index);
    
    // Wrap in a measurable container if dynamic height
    if (!itemHeight) {
      return (
        <MeasurableItem
          key={item.id}
          itemId={item.id}
          onHeightChange={updateItemHeight}
        >
          {itemElement}
        </MeasurableItem>
      );
    }
    
    return <Box key={item.id}>{itemElement}</Box>;
  }, [renderItem, itemHeight, updateItemHeight]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heightUpdateTimer.current) {
        clearTimeout(heightUpdateTimer.current);
      }
    };
  }, []);

  return (
    <Box flexDirection="column" height={viewportHeight} width={width} overflow="hidden">
      {/* Spacer for items above viewport */}
      {scrollMetrics.offsetY > 0 && (
        <Box height={Math.floor(scrollMetrics.offsetY / estimatedItemHeight)} />
      )}
      
      {/* Render visible items */}
      {visibleItems.map((item, index) => 
        renderOptimizedItem(item, scrollMetrics.visibleStartIndex + index)
      )}
      
      {/* Spacer for items below viewport */}
      {scrollMetrics.visibleEndIndex < items.length - 1 && (
        <Box height={Math.floor(
          (scrollMetrics.totalHeight - scrollMetrics.offsetY - viewportHeight) / estimatedItemHeight
        )} />
      )}
    </Box>
  );
}

/**
 * Measurable item wrapper for dynamic height calculation
 */
interface MeasurableItemProps {
  itemId: string;
  children: React.ReactNode;
  onHeightChange: (itemId: string, height: number) => void;
}

const MeasurableItem: React.FC<MeasurableItemProps> = React.memo(({ 
  itemId, 
  children, 
  onHeightChange 
}) => {
  const ref = useRef<any>(null);
  const lastHeight = useRef<number>(0);

  useEffect(() => {
    // In Ink, we can't directly measure height, so we estimate based on content
    // This is a simplified approach - in a real terminal, we'd count lines
    const estimatedHeight = 3; // Default estimate
    
    if (lastHeight.current !== estimatedHeight) {
      lastHeight.current = estimatedHeight;
      onHeightChange(itemId, estimatedHeight);
    }
  }, [itemId, children, onHeightChange]);

  return <Box ref={ref}>{children}</Box>;
});

MeasurableItem.displayName = 'MeasurableItem';

export default VirtualScrollList;