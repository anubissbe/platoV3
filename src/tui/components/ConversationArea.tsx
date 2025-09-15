import React, { useEffect, useRef, useState, useMemo } from "react";
import { Box, Text } from "ink";
import { StyledBox, StyledText } from "../../styles/components.js";
import { getStyleManager } from "../../styles/manager.js";
import {
  ConversationRenderer,
  ConversationMessage,
} from "../conversation-renderer.js";
import { ScrollController } from "../scroll-controller.js";
import {
  StreamingMessage,
  StreamingConversationMessage,
  StreamingMessageManager,
} from "./StreamingMessage.js";
import { MouseSupportLayer } from "./MouseContextMenu.js";
import {
  useResponsiveTerminalSize,
  useResponsiveStyles,
} from "./ResponsiveContainer.js";

export interface ConversationAreaProps {
  messages: ConversationMessage[];
  height?: number;
  width?: number;
  showTimestamps?: boolean;
  showMetadata?: boolean;
  virtualScrolling?: boolean;
  accessibilityMode?: boolean;
  streamingMessage?: StreamingConversationMessage;
  onScroll?: (event: { position: number; direction: "up" | "down" }) => void;
  onStreamComplete?: () => void;
  onStreamInterrupt?: () => void;
  onTextSelect?: (text: string) => void;
  onRightClick?: (x: number, y: number, selectedText?: string) => void;
}

/**
 * ConversationArea component - Professional conversation display with scrolling
 * Integrates with existing scroll controller and conversation renderer
 */
export const ConversationArea: React.FC<ConversationAreaProps> = ({
  messages = [],
  height = 20,
  width = process.stdout.columns || 80,
  showTimestamps = true,
  showMetadata = false,
  virtualScrolling = true,
  accessibilityMode = false,
  streamingMessage,
  onScroll,
  onStreamComplete,
  onStreamInterrupt,
  onTextSelect,
  onRightClick,
}) => {
  const parity = process.env.PLATO_PARITY_MODE === "1";
  const quiet = process.env.PLATO_QUIET_TUI === "1" || parity;
  const scrollControllerRef = useRef<ScrollController | undefined>(undefined);
  const conversationRendererRef = useRef<ConversationRenderer | undefined>(
    undefined,
  );
  const [scrollPosition, setScrollPosition] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const terminalSize = useResponsiveTerminalSize();
  const responsiveStyles = useResponsiveStyles();

  // Initialize scroll controller and conversation renderer
  useEffect(() => {
    const scrollController = new ScrollController({
      scrollSensitivity: quiet ? 1 : 3,
      smoothScrolling: quiet ? false : true,
      scrollDuration: quiet ? 0 : 200,
      enableMomentum: quiet ? false : true,
      throttleInterval: quiet ? 80 : 16,
      boundaryFeedback: quiet ? false : true,
      bounceEffect: false,
    });

    const conversationRenderer = new ConversationRenderer({
      maxLinesVisible: height,
      enableSyntaxHighlighting: true,
      enableWordWrap: true,
      indentSize: 2,
      showTimestamps,
      smoothScrolling: true,
      showBoundaryIndicators: false,
    });

    // Connect scroll controller to renderer
    scrollController.setRenderer(conversationRenderer);

    // Listen for scroll events
    scrollController.on("scroll", (event) => {
      setScrollPosition(event.position);
      setIsScrolling(true);
      onScroll?.({
        position: event.position,
        direction: event.direction,
      });

      // Clear scrolling state after animation
      setTimeout(() => setIsScrolling(false), 200);
    });

    scrollControllerRef.current = scrollController;
    conversationRendererRef.current = conversationRenderer;

    return () => {
      scrollController.dispose();
    };
  }, [height, showTimestamps, onScroll]);

  // Update messages in renderer when they change
  useEffect(() => {
    if (conversationRendererRef.current) {
      conversationRendererRef.current.setMessages(messages);
    }
  }, [messages]);

  // Calculate visible messages for virtual scrolling
  const visibleMessages = useMemo(() => {
    if (parity || !virtualScrolling || messages.length <= height) {
      return messages;
    }

    const startIndex = Math.max(0, Math.floor(scrollPosition / 3)); // Approximate lines per message
    const endIndex = Math.min(messages.length, startIndex + height + 2); // Buffer for smooth scrolling

    return messages.slice(startIndex, endIndex);
  }, [messages, scrollPosition, height, virtualScrolling]);

  // Handle empty conversation (Claude parity: no welcome placeholder)
  if (messages.length === 0) {
    return <StyledBox flexDirection="column" height={height} padding={1} />;
  }

  return (
    <MouseSupportLayer
      onTextSelect={onTextSelect}
      onRightClick={onRightClick}
      streamingMessage={streamingMessage}
    >
      <StyledBox flexDirection="column" height={height} width={width}>
        {/* Scroll indicator */}
        {isScrolling && !quiet && !parity && (
          <Box position="absolute">
            <Text color="gray">◐</Text>
          </Box>
        )}

        {/* Message display area */}
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {visibleMessages.map((message, index) => (
            <MessageComponent
              key={`${message.timestamp}-${index}`}
              message={message}
              showTimestamp={showTimestamps}
              showMetadata={showMetadata}
              accessibilityMode={accessibilityMode}
              width={width - 4} // Account for padding
            />
          ))}

          {/* Streaming message display (only while actively streaming) */}
          {(() => {
            const staticMode =
              process.env.PLATO_STATIC_TUI === "1" ||
              process.env.PLATO_QUIET_TUI === "1";
            if (!streamingMessage) return null;
            // In static/quiet mode, avoid rendering streaming block to prevent duplication
            if (staticMode) return null;
            if (!streamingMessage.isStreaming) return null;
            return (
              <StreamingMessage
                role={streamingMessage.role}
                content={streamingMessage.content}
                isStreaming={true}
                isComplete={streamingMessage.isComplete || false}
                showTimestamp={showTimestamps}
                timestamp={streamingMessage.timestamp}
                onStreamComplete={onStreamComplete}
                onStreamInterrupt={onStreamInterrupt}
                width={width - 4}
                speed={25}
              />
            );
          })()}
        </Box>

        {/* Scroll position indicator */}
        {messages.length > height && (
          <Box justifyContent="space-between" paddingX={1}>
            <StyledText type="secondary">
              {Math.min(
                visibleMessages.length + Math.floor(scrollPosition / 3),
                messages.length,
              )}
              /{messages.length}
            </StyledText>
            <StyledText type="secondary">
              {scrollPosition > 0 && "↑"}{" "}
              {scrollPosition < messages.length * 3 - height && "↓"}
            </StyledText>
          </Box>
        )}
      </StyledBox>
    </MouseSupportLayer>
  );
};

/**
 * MessageComponent - Individual message display with role-based styling
 */
interface MessageComponentProps {
  message: ConversationMessage;
  showTimestamp: boolean;
  showMetadata: boolean;
  accessibilityMode: boolean;
  width: number;
}

const MessageComponent: React.FC<MessageComponentProps> = React.memo(
  ({ message, showTimestamp, showMetadata, accessibilityMode, width }) => {
    const manager = getStyleManager();
    const style = manager.getStyle();

    // Role-based styling
    const getRoleDisplay = () => {
      switch (message.role) {
        case "user":
          return {
            icon: "👤",
            label: "You",
            color: "info" as const,
            prefix: accessibilityMode ? "User says:" : "",
          };
        case "assistant":
          return {
            icon: "🤖",
            label: "Assistant",
            color: "success" as const,
            prefix: accessibilityMode ? "Assistant responds:" : "",
          };
        case "system":
          return {
            icon: "⚙️",
            label: "System",
            color: "warning" as const,
            prefix: accessibilityMode ? "System message:" : "",
          };
        default:
          return {
            icon: "💬",
            label: "Message",
            color: "primary" as const,
            prefix: "",
          };
      }
    };

    // Format timestamp
    const formatTimestamp = (timestamp: number) => {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now.getTime() - date.getTime();

      if (diff < 60000) {
        // Less than 1 minute
        return "just now";
      } else if (diff < 3600000) {
        // Less than 1 hour
        const minutes = Math.floor(diff / 60000);
        return `${minutes}m ago`;
      } else if (diff < 86400000) {
        // Less than 1 day
        const hours = Math.floor(diff / 3600000);
        return `${hours}h ago`;
      } else {
        return date.toLocaleDateString();
      }
    };

    // Format metadata
    const formatMetadata = () => {
      if (!showMetadata || !message.metadata) return null;

      const parts = [];
      if (message.metadata.model) parts.push(message.metadata.model);
      if (message.metadata.tokensUsed)
        parts.push(`${message.metadata.tokensUsed} tokens`);
      if (message.metadata.duration)
        parts.push(`${(message.metadata.duration / 1000).toFixed(1)}s`);

      return parts.join(" • ");
    };

    // Wrap text to fit width
    const wrapText = (text: string, maxWidth: number) => {
      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        if ((currentLine + word).length <= maxWidth) {
          currentLine += (currentLine ? " " : "") + word;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }

      if (currentLine) lines.push(currentLine);
      return lines;
    };

    const roleDisplay = getRoleDisplay();
    const timestamp = formatTimestamp(message.timestamp);
    const metadata = formatMetadata();
    const wrappedLines = wrapText(message.content || "", width - 6); // Account for indentation

    return (
      <Box flexDirection="column" marginY={1}>
        {/* Message header */}
        <Box flexDirection="row" marginBottom={0}>
          <Box marginRight={1}>
            <Text>{roleDisplay.icon}</Text>
          </Box>
          <Box flexDirection="row" alignItems="center">
            <StyledText type={roleDisplay.color} bold>
              {roleDisplay.label}
            </StyledText>
            {showTimestamp && (
              <>
                <StyledText type="secondary"> • </StyledText>
                <StyledText type="secondary">{timestamp}</StyledText>
              </>
            )}
            {metadata && (
              <>
                <StyledText type="secondary"> • </StyledText>
                <StyledText type="secondary">{metadata}</StyledText>
              </>
            )}
          </Box>
        </Box>

        {/* Message content */}
        <Box flexDirection="column" marginLeft={3}>
          {accessibilityMode && roleDisplay.prefix && (
            <StyledText type="secondary">{roleDisplay.prefix}</StyledText>
          )}
          {wrappedLines.map((line, index) => (
            <Box key={index}>
              <MessageContentRenderer content={line} />
            </Box>
          ))}
        </Box>
      </Box>
    );
  },
);

/**
 * MessageContentRenderer - Handles markdown and code rendering
 */
interface MessageContentRendererProps {
  content: string;
}

const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({
  content,
}) => {
  // Basic markdown detection
  const isCodeBlock = content.trim().startsWith("```");
  const isInlineCode = content.includes("`") && !isCodeBlock;
  const isBold = content.includes("**");
  const isItalic = content.includes("*") && !isBold;

  // Code block handling
  if (isCodeBlock) {
    const cleanContent = content.replace(/```\w*\n?|\n?```/g, "");
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
      >
        <StyledText type="secondary">{cleanContent}</StyledText>
      </Box>
    );
  }

  // Inline code handling
  if (isInlineCode) {
    const parts = content.split("`");
    return (
      <Box flexDirection="row">
        {parts.map((part, index) => (
          <Text
            key={index}
            backgroundColor={index % 2 === 1 ? "gray" : undefined}
          >
            {part}
          </Text>
        ))}
      </Box>
    );
  }

  // Bold text
  if (isBold) {
    const parts = content.split("**");
    return (
      <Box flexDirection="row">
        {parts.map((part, index) => (
          <Text key={index} bold={index % 2 === 1}>
            {part}
          </Text>
        ))}
      </Box>
    );
  }

  // Regular text
  return <StyledText type="primary">{content}</StyledText>;
};

export default ConversationArea;
