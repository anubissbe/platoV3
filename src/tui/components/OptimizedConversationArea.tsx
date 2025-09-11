/**
 * OptimizedConversationArea - High-performance conversation display
 * Achieves consistent 60fps with virtual scrolling and memoization
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { StyledBox, StyledText } from '../../styles/components.js';
import { ConversationMessage } from '../conversation-renderer.js';
import { VirtualScrollList, VirtualScrollItem } from './VirtualScrollList.js';
import { MemoizedMessage, MemoizedScrollIndicator } from './MemoizedComponents.js';
import { 
  useThrottledUpdate, 
  useOptimizedScroll,
  useBatchedUpdates,
  PerformanceUtils
} from '../performance/RenderOptimizer.js';
import { PerformanceMonitor, useRenderPerformance } from '../performance/PerformanceMonitor.js';
import { MouseSupportLayer } from './MouseContextMenu.js';
import { StreamingConversationMessage } from './StreamingMessage.js';

export interface OptimizedConversationAreaProps {
  messages: ConversationMessage[];
  height?: number;
  width?: number;
  showTimestamps?: boolean;
  showMetadata?: boolean;
  virtualScrolling?: boolean;
  accessibilityMode?: boolean;
  streamingMessage?: StreamingConversationMessage;
  showPerformanceOverlay?: boolean;
  targetFPS?: number;
  onScroll?: (event: { position: number; direction: 'up' | 'down' }) => void;
  onStreamComplete?: () => void;
  onStreamInterrupt?: () => void;
  onTextSelect?: (text: string) => void;
  onRightClick?: (x: number, y: number, selectedText?: string) => void;
}

interface ConversationScrollItem extends VirtualScrollItem {
  message: ConversationMessage;
  index: number;
}

/**
 * Optimized conversation area with 60fps performance target
 */
export const OptimizedConversationArea: React.FC<OptimizedConversationAreaProps> = ({
  messages = [],
  height = 20,
  width = process.stdout.columns || 80,
  showTimestamps = true,
  showMetadata = false,
  virtualScrolling = true,
  accessibilityMode = false,
  streamingMessage,
  showPerformanceOverlay = false,
  targetFPS = 60,
  onScroll,
  onStreamComplete,
  onStreamInterrupt,
  onTextSelect,
  onRightClick
}) => {
  // Performance tracking
  const { measureRender } = useRenderPerformance('OptimizedConversationArea');
  const lastRenderTime = useRef(Date.now());
  
  // Scroll state with optimizations
  const [scrollState, setScrollState] = useBatchedUpdates({
    position: 0,
    isScrolling: false,
    direction: 'down' as 'up' | 'down'
  });
  
  // Throttle scroll position updates for 60fps
  const throttledScrollPosition = useThrottledUpdate(scrollState.position, 16);
  
  // Optimize scroll handling
  const handleOptimizedScroll = useOptimizedScroll((position, direction) => {
    // Skip render if we're below target FPS
    if (PerformanceUtils.shouldSkipRender(lastRenderTime.current, targetFPS)) {
      return;
    }
    
    setScrollState({
      position,
      isScrolling: true,
      direction
    });
    
    // Clear scrolling indicator after animation
    setTimeout(() => {
      setScrollState({ isScrolling: false });
    }, 200);
    
    onScroll?.({ position, direction });
    lastRenderTime.current = Date.now();
  }, 5);

  // Convert messages to virtual scroll items
  const scrollItems = useMemo((): ConversationScrollItem[] => {
    return messages.map((message, index) => ({
      id: message.id || `msg-${index}`,
      message,
      index,
      content: null, // Content rendered by renderItem
      height: estimateMessageHeight(message, width)
    }));
  }, [messages, width]);

  // Estimate message height for virtual scrolling
  function estimateMessageHeight(message: ConversationMessage, maxWidth: number): number {
    // Base height for header and padding
    let height = 3;
    
    // Estimate content lines
    if (message.content) {
      const contentLength = message.content.length;
      const charsPerLine = maxWidth - 4; // Account for padding
      height += Math.ceil(contentLength / charsPerLine);
    }
    
    // Add metadata height if shown
    if (showMetadata && message.metadata) {
      height += 2;
    }
    
    return Math.min(height, 20); // Cap at reasonable maximum
  }

  // Memoized render function for virtual list items
  const renderMessage = useCallback((item: ConversationScrollItem, index: number) => {
    const endMeasure = measureRender();
    
    const element = (
      <MemoizedMessage
        message={item.message}
        index={index}
        showTimestamp={showTimestamps}
        showMetadata={showMetadata}
        width={width}
        onSelect={undefined}
      />
    );
    
    // Log slow renders in development
    if (process.env.NODE_ENV === 'development') {
      const renderTime = endMeasure();
      if (renderTime > 16.67) {
        console.warn(`Slow message render: ${renderTime.toFixed(2)}ms`);
      }
    }
    
    return element;
  }, [showTimestamps, showMetadata, width, measureRender]);

  // Calculate optimal overscan based on performance
  const overscan = useMemo(() => {
    return PerformanceUtils.getOptimalBatchSize(messages.length, targetFPS);
  }, [messages.length, targetFPS]);

  // Handle empty conversation
  if (messages.length === 0) {
    return (
      <StyledBox flexDirection="column" height={height} padding={1}>
        <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
          <StyledText type="secondary">
            Welcome to Plato! Start a conversation by typing below.
          </StyledText>
          <Box marginTop={1}>
            <StyledText type="secondary">
              Type /help for available commands
            </StyledText>
          </Box>
        </Box>
      </StyledBox>
    );
  }

  return (
    <MouseSupportLayer
      onTextSelect={onTextSelect}
      onRightClick={onRightClick}
      streamingMessage={streamingMessage}
    >
      <StyledBox flexDirection="column" height={height} width={width}>
        {/* Performance overlay */}
        {showPerformanceOverlay && (
          <PerformanceMonitor
            enabled={true}
            targetFPS={targetFPS}
            showOverlay={true}
            position="top-right"
          />
        )}
        
        {/* Scroll indicator */}
        {scrollState.isScrolling && (
          <Box position="absolute" right={0} top={0}>
            <MemoizedScrollIndicator
              current={throttledScrollPosition}
              total={messages.length * 3}
              visible={true}
            />
          </Box>
        )}
        
        {/* Virtual scrolling message list */}
        {virtualScrolling ? (
          <VirtualScrollList
            items={scrollItems}
            height={height}
            width={width}
            overscan={overscan}
            scrollPosition={throttledScrollPosition}
            onScroll={handleOptimizedScroll}
            renderItem={renderMessage}
            estimatedItemHeight={3}
            cacheSize={100}
          />
        ) : (
          // Fallback to regular rendering for small lists
          <Box flexDirection="column" overflow="hidden">
            {messages.map((message, index) => (
              <MemoizedMessage
                key={message.id || `msg-${index}`}
                message={message}
                index={index}
                showTimestamp={showTimestamps}
                showMetadata={showMetadata}
                width={width}
              />
            ))}
          </Box>
        )}
        
        {/* Streaming message indicator */}
        {streamingMessage && (
          <Box position="absolute" bottom={0} left={0}>
            <StyledText type="info">Streaming...</StyledText>
          </Box>
        )}
      </StyledBox>
    </MouseSupportLayer>
  );
};

// Export with default memo for additional optimization
export default React.memo(OptimizedConversationArea);