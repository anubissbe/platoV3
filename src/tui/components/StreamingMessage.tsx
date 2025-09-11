import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { TypewriterEffect, StreamingIndicator } from '../LoadingAnimations.js';

export interface StreamingMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming: boolean;
  isComplete: boolean;
  showTimestamp?: boolean;
  timestamp?: number;
  onStreamComplete?: () => void;
  onStreamInterrupt?: () => void;
  width?: number;
  speed?: number; // milliseconds between characters
}

/**
 * StreamingMessage component - Renders messages with typewriter effects during streaming
 * Implements Claude Code's real-time streaming with 25ms character intervals
 */
export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  role,
  content,
  isStreaming,
  isComplete,
  showTimestamp = true,
  timestamp,
  onStreamComplete,
  onStreamInterrupt,
  width = process.stdout.columns || 80,
  speed = 25, // 25ms per character as per technical spec
}) => {
  const [streamingContent, setStreamingContent] = useState('');
  const [showCursor, setShowCursor] = useState(false);
  const streamingRef = useRef(false);
  const interruptedRef = useRef(false);

  // Handle streaming state changes
  useEffect(() => {
    if (isStreaming && !streamingRef.current) {
      streamingRef.current = true;
      setShowCursor(true);
      setStreamingContent('');
    } else if (!isStreaming && streamingRef.current) {
      streamingRef.current = false;
      setShowCursor(false);
      if (isComplete && !interruptedRef.current) {
        setStreamingContent(content);
      }
    }
  }, [isStreaming, content, isComplete]);

  // Handle stream completion
  const handleTypewriterComplete = () => {
    setShowCursor(false);
    streamingRef.current = false;
    onStreamComplete?.();
  };

  // Handle stream interruption (Ctrl+C or Escape)
  const handleStreamInterrupt = () => {
    interruptedRef.current = true;
    setShowCursor(false);
    streamingRef.current = false;
    onStreamInterrupt?.();
  };

  // Reset interruption flag when new streaming starts
  useEffect(() => {
    if (isStreaming) {
      interruptedRef.current = false;
    }
  }, [isStreaming]);

  // Cursor blink effect during streaming
  useEffect(() => {
    if (!showCursor) return;

    const interval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 530); // Standard cursor blink rate

    return () => clearInterval(interval);
  }, [showCursor]);

  // Format timestamp
  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  // Role-based styling
  const getRoleConfig = () => {
    switch (role) {
      case 'user':
        return {
          prefix: '> ',
          color: 'cyan',
          bgColor: undefined,
          icon: '👤'
        };
      case 'assistant':
        return {
          prefix: '',
          color: 'white',
          bgColor: undefined,
          icon: '🤖'
        };
      case 'system':
        return {
          prefix: '* ',
          color: 'yellow',
          bgColor: undefined,
          icon: 'ℹ️'
        };
      default:
        return {
          prefix: '',
          color: 'white',
          bgColor: undefined,
          icon: ''
        };
    }
  };

  const roleConfig = getRoleConfig();
  const cursor = showCursor ? '▋' : '';

  return (
    <Box flexDirection="column" width={width} marginBottom={1}>
      {/* Message header with role and timestamp */}
      {showTimestamp && (
        <Box justifyContent="space-between" marginBottom={0}>
          <Box>
            <Text color="gray">
              {roleConfig.icon} {role}
            </Text>
          </Box>
          {timestamp && (
            <Text color="gray" dimColor>
              {formatTimestamp(timestamp)}
            </Text>
          )}
        </Box>
      )}

      {/* Message content with streaming or static display */}
      <Box flexDirection="column" paddingLeft={1}>
        {isStreaming && !isComplete ? (
          // Currently streaming - show typewriter effect
          <Box flexDirection="column">
            <StreamingIndicator 
              isStreaming={true} 
              text="Assistant is typing" 
            />
            <Box marginTop={1}>
              <Text color={roleConfig.color}>
                {roleConfig.prefix}
                <TypewriterEffect
                  text={content}
                  speed={speed}
                  onComplete={handleTypewriterComplete}
                />
                {cursor}
              </Text>
            </Box>
          </Box>
        ) : (
          // Static content - show complete message
          <Text color={roleConfig.color}>
            {roleConfig.prefix}{content}
          </Text>
        )}

        {/* Streaming error state */}
        {interruptedRef.current && (
          <Box marginTop={1}>
            <Text color="red" dimColor>
              Stream interrupted
            </Text>
          </Box>
        )}
      </Box>

      {/* Streaming progress indicator */}
      {isStreaming && (
        <Box marginTop={1} paddingLeft={1}>
          <Text dimColor>
            {streamingContent.length}/{content.length} characters • Press Escape to stop
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Compact version for limited space
 */
export const CompactStreamingMessage: React.FC<StreamingMessageProps> = (props) => {
  const { role, content, isStreaming, speed = 25 } = props;
  const rolePrefix = role === 'user' ? '> ' : role === 'assistant' ? '🤖 ' : '* ';

  if (isStreaming) {
    return (
      <Box>
        <Text>
          {rolePrefix}
          <TypewriterEffect text={content} speed={speed} />
          <Text color="cyan">▋</Text>
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text>{rolePrefix}{content}</Text>
    </Box>
  );
};

/**
 * Enhanced message interface for streaming support
 */
export interface StreamingConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    duration?: number;
  };
  // Streaming-specific fields
  isStreaming?: boolean;
  isComplete?: boolean;
  streamProgress?: {
    charactersReceived: number;
    totalCharacters?: number;
    streamStartTime: number;
    estimatedTimeRemaining?: number;
  };
}

/**
 * Streaming state manager for conversation messages
 */
export class StreamingMessageManager {
  private streamingMessage: StreamingConversationMessage | null = null;
  private onUpdate: ((message: StreamingConversationMessage | null) => void) | null = null;

  setUpdateCallback(callback: (message: StreamingConversationMessage | null) => void) {
    this.onUpdate = callback;
  }

  startStreaming(role: 'assistant' | 'system', initialContent = '') {
    this.streamingMessage = {
      role,
      content: initialContent,
      timestamp: Date.now(),
      isStreaming: true,
      isComplete: false,
      streamProgress: {
        charactersReceived: 0,
        streamStartTime: Date.now()
      }
    };
    this.onUpdate?.(this.streamingMessage);
  }

  updateStreamContent(newContent: string) {
    if (!this.streamingMessage) return;

    this.streamingMessage.content = newContent;
    if (this.streamingMessage.streamProgress) {
      this.streamingMessage.streamProgress.charactersReceived = newContent.length;
    }
    this.onUpdate?.(this.streamingMessage);
  }

  completeStream(finalContent?: string) {
    if (!this.streamingMessage) return;

    if (finalContent) {
      this.streamingMessage.content = finalContent;
    }
    this.streamingMessage.isStreaming = false;
    this.streamingMessage.isComplete = true;
    
    if (this.streamingMessage.streamProgress) {
      const duration = Date.now() - this.streamingMessage.streamProgress.streamStartTime;
      this.streamingMessage.metadata = {
        ...this.streamingMessage.metadata,
        duration
      };
    }

    const completedMessage = { ...this.streamingMessage };
    this.streamingMessage = null;
    this.onUpdate?.(completedMessage);
  }

  interruptStream() {
    if (!this.streamingMessage) return;

    this.streamingMessage.isStreaming = false;
    this.streamingMessage.isComplete = false;
    
    const interruptedMessage = { ...this.streamingMessage };
    this.streamingMessage = null;
    this.onUpdate?.(interruptedMessage);
  }

  getCurrentStreamingMessage(): StreamingConversationMessage | null {
    return this.streamingMessage;
  }
}