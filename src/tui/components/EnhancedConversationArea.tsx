import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { MessageBubble } from "./MessageBubble";
import type { MessageBubbleProps, MessageRole, MessageStatus } from "./MessageBubble";
import { ConversationMessage } from "../conversation-renderer.js";
import {
  useResponsiveTerminalSize,
  useResponsiveStyles,
} from "./ResponsiveContainer.js";

export interface EnhancedConversationAreaProps {
  messages: ConversationMessage[];
  height?: number;
  width?: number;
  showTimestamps?: boolean;
  showMetadata?: boolean;
  enableKeyboardNavigation?: boolean;
  accessibilityMode?: boolean;
  theme?: "light" | "dark" | "auto";
  onMessageSelect?: (messageIndex: number) => void;
  onMessageAction?: (action: string, messageIndex: number) => void;
}

// Convert ConversationMessage to MessageBubbleProps
const convertToMessageBubbleProps = (message: ConversationMessage): MessageBubbleProps => ({
  role: message.role as MessageRole,
  content: message.content,
  timestamp: new Date(message.timestamp),
  status: "complete" as MessageStatus, // Default to complete for existing messages
  metadata: message.metadata ? {
    model: message.metadata.model,
    tokens: message.metadata.tokensUsed,
    ...(message.metadata.duration && { duration: message.metadata.duration })
  } : undefined
});

// Interactive MessageBubble wrapper component
const InteractiveMessageBubble: React.FC<{
  message: MessageBubbleProps;
  index: number;
  isFocused: boolean;
  showMetadata: boolean;
  onAction?: (action: string, index: number) => void;
}> = ({ message, index, isFocused, showMetadata, onAction }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const bubble = new MessageBubble(message);

  // Generate display content based on expansion state
  const displayContent = useMemo(() => {
    if (isExpanded) {
      // Show full content with rich formatting
      if (bubble.hasToolCalls()) {
        return bubble.renderWithToolCalls();
      } else if (bubble.hasCodeBlocks()) {
        return bubble.renderWithCodeBlocks();
      } else if (bubble.hasMarkdown()) {
        return bubble.renderMarkdown();
      }
      return bubble.content;
    } else {
      // Show truncated content
      return bubble.getTruncatedContent(80);
    }
  }, [bubble, isExpanded]);

  const handleToggleExpansion = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (onAction) {
      onAction(newExpanded ? "expand" : "collapse", index);
    }
  };

  const handleCopy = () => {
    if (onAction) {
      onAction("copy", index);
    }
  };

  const focusIndicator = isFocused ? "▶ " : "  ";
  const borderColor = isFocused ? "cyan" : bubble.getRoleColor();

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginBottom={1}
    >
      {/* Header with role and timestamp */}
      <Box justifyContent="space-between">
        <Text color={bubble.getRoleColor()}>
          {focusIndicator}{bubble.getRoleIndicator()} {bubble.role}
        </Text>
        <Text color="gray" dimColor>
          {bubble.getFormattedTime()}
        </Text>
      </Box>

      {/* Content area */}
      <Box flexDirection="column" paddingY={1}>
        <Text wrap="wrap">
          {displayContent}
        </Text>
      </Box>

      {/* Metadata display */}
      {showMetadata && bubble.metadata && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {bubble.getFormattedMetadata()}
          </Text>
        </Box>
      )}

      {/* Status indicator */}
      {bubble.status && bubble.status !== "complete" && (
        <Box justifyContent="flex-end">
          <Text color="gray">
            {bubble.getStatusIndicator()}
          </Text>
        </Box>
      )}

      {/* Keyboard help for focused message */}
      {isFocused && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Enter: {isExpanded ? "Collapse" : "Expand"} | Ctrl+C: Copy | ↑↓: Navigate
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Enhanced ConversationArea with MessageBubble integration
 * Provides rich message display with keyboard navigation and interaction
 */
export const EnhancedConversationArea: React.FC<EnhancedConversationAreaProps> = ({
  messages = [],
  height = 20,
  width,
  showTimestamps = true,
  showMetadata = false,
  enableKeyboardNavigation = true,
  accessibilityMode = false,
  theme = "auto",
  onMessageSelect,
  onMessageAction,
}) => {
  const [focusedMessageIndex, setFocusedMessageIndex] = useState(0);
  const { terminalWidth, terminalHeight } = useResponsiveTerminalSize();
  const responsiveStyles = useResponsiveStyles();

  // Use responsive width if not provided
  const containerWidth = width || terminalWidth;

  // Convert messages to MessageBubble format
  const bubbleMessages = useMemo(
    () => messages.map(convertToMessageBubbleProps),
    [messages]
  );

  // Keyboard input handling
  useInput((input, key) => {
    if (!enableKeyboardNavigation) return;

    if (key.upArrow) {
      setFocusedMessageIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setFocusedMessageIndex(prev => Math.min(messages.length - 1, prev + 1));
    } else if (key.return) {
      // Handle expand/collapse
      if (onMessageAction) {
        onMessageAction("toggle", focusedMessageIndex);
      }
    } else if (input === "c" && key.ctrl) {
      // Handle copy
      if (onMessageAction) {
        onMessageAction("copy", focusedMessageIndex);
      }
    } else if (key.tab) {
      // Handle focus change
      if (onMessageSelect) {
        onMessageSelect(focusedMessageIndex);
      }
    }
  });

  // Ensure focused index is within bounds
  useEffect(() => {
    if (focusedMessageIndex >= messages.length) {
      setFocusedMessageIndex(Math.max(0, messages.length - 1));
    }
  }, [messages.length, focusedMessageIndex]);

  // Handle message actions
  const handleMessageAction = (action: string, messageIndex: number) => {
    if (onMessageAction) {
      onMessageAction(action, messageIndex);
    }
  };

  return (
    <Box flexDirection="column" height={height} width={containerWidth}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="blue">
          💬 Conversation ({messages.length} messages)
        </Text>
        {enableKeyboardNavigation && (
          <Text color="gray" dimColor>
            {" "}• Use ↑↓ to navigate, Enter to expand, Ctrl+C to copy
          </Text>
        )}
      </Box>

      {/* Messages container with scrolling */}
      <Box flexDirection="column" flexGrow={1} overflowY="auto">
        {bubbleMessages.length === 0 ? (
          <Box justifyContent="center" alignItems="center" height="100%">
            <Text color="gray" dimColor>
              No messages yet. Start a conversation!
            </Text>
          </Box>
        ) : (
          bubbleMessages.map((message, index) => (
            <InteractiveMessageBubble
              key={index}
              message={message}
              index={index}
              isFocused={enableKeyboardNavigation && index === focusedMessageIndex}
              showMetadata={showMetadata}
              onAction={handleMessageAction}
            />
          ))
        )}
      </Box>

      {/* Footer with accessibility info */}
      {accessibilityMode && (
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray" dimColor>
            Accessibility: {bubbleMessages.length} messages, focused on message {focusedMessageIndex + 1}
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default EnhancedConversationArea;