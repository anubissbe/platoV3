/**
 * MemoizedComponents - Performance-optimized memoized components
 * Prevents unnecessary re-renders for improved performance
 */

import React, { memo, useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { ConversationMessage } from '../conversation-renderer.js';
import { StyledText } from '../../styles/components.js';

/**
 * Memoized message component with deep comparison
 */
export interface MemoizedMessageProps {
  message: ConversationMessage;
  index: number;
  showTimestamp?: boolean;
  showMetadata?: boolean;
  width?: number;
  onSelect?: (message: ConversationMessage) => void;
}

export const MemoizedMessage = memo<MemoizedMessageProps>(({
  message,
  index,
  showTimestamp = true,
  showMetadata = false,
  width,
  onSelect
}) => {
  // Memoize formatted timestamp
  const formattedTimestamp = useMemo(() => {
    if (!showTimestamp || !message.timestamp) return null;
    
    const date = new Date(message.timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }, [showTimestamp, message.timestamp]);

  // Memoize role display
  const roleDisplay = useMemo(() => {
    switch (message.role) {
      case 'user':
        return { text: 'You', color: 'cyan' };
      case 'assistant':
        return { text: 'AI', color: 'green' };
      case 'system':
        return { text: 'System', color: 'yellow' };
      default:
        return { text: 'Unknown', color: 'gray' };
    }
  }, [message.role]);

  // Memoize click handler
  const handleClick = useCallback(() => {
    onSelect?.(message);
  }, [message, onSelect]);

  // Memoize content processing
  const processedContent = useMemo(() => {
    if (!message.content) return '';
    
    // Truncate very long messages for performance
    const maxLength = width ? width * 10 : 1000;
    if (message.content.length > maxLength) {
      return message.content.substring(0, maxLength) + '...';
    }
    
    return message.content;
  }, [message.content, width]);

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Message header */}
      <Box flexDirection="row" marginBottom={0}>
        {formattedTimestamp && (
          <Text color="gray" dimColor>
            [{formattedTimestamp}]
          </Text>
        )}
        <Box marginLeft={formattedTimestamp ? 1 : 0}>
          <Text color={roleDisplay.color} bold>
            {roleDisplay.text}:
          </Text>
        </Box>
      </Box>
      
      {/* Message content */}
      <Box paddingLeft={2}>
        <Text wrap="wrap">
          {processedContent}
        </Text>
      </Box>
      
      {/* Metadata */}
      {showMetadata && message.metadata && (
        <Box paddingLeft={2} marginTop={1}>
          <Text color="gray" dimColor>
            {JSON.stringify(message.metadata)}
          </Text>
        </Box>
      )}
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for deep equality check
  return (
    prevProps.message.timestamp === nextProps.message.timestamp &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.index === nextProps.index &&
    prevProps.showTimestamp === nextProps.showTimestamp &&
    prevProps.showMetadata === nextProps.showMetadata &&
    prevProps.width === nextProps.width
  );
});

MemoizedMessage.displayName = 'MemoizedMessage';

/**
 * Memoized header component
 */
export interface MemoizedHeaderProps {
  title: string;
  subtitle?: string;
  status?: 'connected' | 'connecting' | 'disconnected' | 'error';
  tokens?: number;
  maxTokens?: number;
}

export const MemoizedHeader = memo<MemoizedHeaderProps>(({
  title,
  subtitle,
  status = 'disconnected',
  tokens,
  maxTokens
}) => {
  const statusIcon = useMemo(() => {
    switch (status) {
      case 'connected': return '●';
      case 'connecting': return '◐';
      case 'disconnected': return '○';
      case 'error': return '✗';
      default: return '○';
    }
  }, [status]);

  const statusColor = useMemo(() => {
    switch (status) {
      case 'connected': return 'green';
      case 'connecting': return 'yellow';
      case 'disconnected': return 'gray';
      case 'error': return 'red';
      default: return 'gray';
    }
  }, [status]);

  const tokenPercentage = useMemo(() => {
    if (!tokens || !maxTokens) return null;
    return Math.round((tokens / maxTokens) * 100);
  }, [tokens, maxTokens]);

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Box>
          <Text bold>{title}</Text>
          {subtitle && (
            <Text color="gray"> | {subtitle}</Text>
          )}
        </Box>
        <Box>
          <Text color={statusColor}>{statusIcon}</Text>
          {tokenPercentage !== null && (
            <Text color={tokenPercentage > 80 ? 'red' : 'gray'}>
              {' '}Tokens: {tokenPercentage}%
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
});

MemoizedHeader.displayName = 'MemoizedHeader';

/**
 * Memoized input area component
 */
export interface MemoizedInputAreaProps {
  value: string;
  placeholder?: string;
  isMultiline?: boolean;
  height?: number;
  onSubmit?: (value: string) => void;
  onChange?: (value: string) => void;
}

export const MemoizedInputArea = memo<MemoizedInputAreaProps>(({
  value,
  placeholder = 'Type a message...',
  isMultiline = false,
  height = 3,
  onSubmit,
  onChange
}) => {
  const lines = useMemo(() => {
    if (!isMultiline) return [value];
    return value.split('\n');
  }, [value, isMultiline]);

  const displayLines = useMemo(() => {
    if (lines.length <= height) return lines;
    return lines.slice(-height);
  }, [lines, height]);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      paddingX={1}
      height={isMultiline ? height + 2 : 3}
    >
      {displayLines.length === 0 && (
        <Text color="gray">{placeholder}</Text>
      )}
      {displayLines.map((line, index) => (
        <Text key={index}>{line || ' '}</Text>
      ))}
    </Box>
  );
});

MemoizedInputArea.displayName = 'MemoizedInputArea';

/**
 * Memoized scroll indicator
 */
export interface MemoizedScrollIndicatorProps {
  current: number;
  total: number;
  visible?: boolean;
}

export const MemoizedScrollIndicator = memo<MemoizedScrollIndicatorProps>(({
  current,
  total,
  visible = true
}) => {
  const percentage = useMemo(() => {
    if (total === 0) return 0;
    return Math.round((current / total) * 100);
  }, [current, total]);

  const barLength = 10;
  const filledLength = useMemo(() => {
    return Math.round((percentage / 100) * barLength);
  }, [percentage, barLength]);

  const scrollBar = useMemo(() => {
    const filled = '█'.repeat(filledLength);
    const empty = '░'.repeat(barLength - filledLength);
    return filled + empty;
  }, [filledLength, barLength]);

  if (!visible) return null;

  return (
    <Box flexDirection="row">
      <Text color="gray">{scrollBar}</Text>
      <Text color="gray"> {percentage}%</Text>
    </Box>
  );
});

MemoizedScrollIndicator.displayName = 'MemoizedScrollIndicator';

/**
 * Memoized status line component
 */
export interface MemoizedStatusLineProps {
  mode?: string;
  context?: string;
  session?: string;
  messageCount?: number;
  connectionStatus?: 'connected' | 'connecting' | 'disconnected';
}

export const MemoizedStatusLine = memo<MemoizedStatusLineProps>(({
  mode,
  context,
  session,
  messageCount = 0,
  connectionStatus = 'disconnected'
}) => {
  const statusColor = useMemo(() => {
    switch (connectionStatus) {
      case 'connected': return 'green';
      case 'connecting': return 'yellow';
      case 'disconnected': return 'gray';
      default: return 'gray';
    }
  }, [connectionStatus]);

  return (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
      <Box>
        {mode && <Text color="yellow">[{mode}]</Text>}
        {context && <Text color="gray"> {context}</Text>}
      </Box>
      <Box>
        {messageCount > 0 && (
          <Text color="gray">Messages: {messageCount} | </Text>
        )}
        {session && <Text color="gray">Session: {session} | </Text>}
        <Text color={statusColor}>●</Text>
      </Box>
    </Box>
  );
});

MemoizedStatusLine.displayName = 'MemoizedStatusLine';

export default {
  MemoizedMessage,
  MemoizedHeader,
  MemoizedInputArea,
  MemoizedScrollIndicator,
  MemoizedStatusLine
};