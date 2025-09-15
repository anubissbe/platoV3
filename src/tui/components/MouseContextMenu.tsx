import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  action: () => void;
  disabled?: boolean;
  shortcut?: string;
}

export interface MouseContextMenuProps {
  isVisible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  selectedText?: string;
  streamingContext?: boolean;
}

/**
 * Mouse context menu component for right-click functionality
 * Provides copy/paste, streaming controls, and text selection actions
 */
export const MouseContextMenu: React.FC<MouseContextMenuProps> = ({
  isVisible,
  x,
  y,
  items,
  onClose,
  selectedText,
  streamingContext = false,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyPress = (str: string, key: any) => {
      if (key.escape) {
        onClose();
      } else if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
      } else if (key.return) {
        const selectedItem = items[selectedIndex];
        if (selectedItem && !selectedItem.disabled) {
          selectedItem.action();
          onClose();
        }
      }
    };

    // Note: In real implementation, you'd need to integrate with Ink's input handling
    // process.stdin.on('keypress', handleKeyPress);

    return () => {
      // process.stdin.off('keypress', handleKeyPress);
    };
  }, [isVisible, selectedIndex, items, onClose]);

  if (!isVisible) {
    return null;
  }

  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      backgroundColor="black"
      flexDirection="column"
      width={24}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Context Menu
        </Text>
      </Box>

      {items.map((item, index) => (
        <Box
          key={item.id}
          backgroundColor={index === selectedIndex ? "blue" : undefined}
          paddingX={1}
          justifyContent="space-between"
        >
          <Box>
            <Text
              color={
                item.disabled
                  ? "gray"
                  : index === selectedIndex
                    ? "white"
                    : undefined
              }
              dimColor={item.disabled}
            >
              {item.icon && `${item.icon} `}
              {item.label}
            </Text>
          </Box>
          {item.shortcut && <Text dimColor>{item.shortcut}</Text>}
        </Box>
      ))}

      {selectedText && (
        <Box marginTop={1} borderTop borderColor="gray" paddingTop={1}>
          <Text dimColor>
            Selected:{" "}
            {selectedText.length > 20
              ? `${selectedText.slice(0, 20)}...`
              : selectedText}
          </Text>
        </Box>
      )}

      <Box marginTop={1} borderTop borderColor="gray" paddingTop={1}>
        <Text dimColor>Use ↑↓ to navigate, Enter to select, Esc to close</Text>
      </Box>
    </Box>
  );
};

/**
 * Hook for managing context menu state and actions
 */
export const useMouseContextMenu = (streamingMessage?: any) => {
  const [menuState, setMenuState] = useState({
    isVisible: false,
    x: 0,
    y: 0,
    selectedText: "",
  });

  const showMenu = (x: number, y: number, selectedText = "") => {
    setMenuState({
      isVisible: true,
      x,
      y,
      selectedText,
    });
  };

  const hideMenu = () => {
    setMenuState((prev) => ({ ...prev, isVisible: false }));
  };

  // Default context menu items
  const getDefaultItems = (): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];

    // Copy selected text
    if (menuState.selectedText) {
      items.push({
        id: "copy",
        label: "Copy",
        icon: "📋",
        shortcut: "Ctrl+C",
        action: () => {
          // In a real implementation, you'd integrate with system clipboard
          console.log("Copied to clipboard:", menuState.selectedText);
        },
      });
    }

    // Paste
    items.push({
      id: "paste",
      label: "Paste",
      icon: "📄",
      shortcut: "Ctrl+V",
      action: () => {
        // In a real implementation, you'd paste from system clipboard
        console.log("Paste action triggered");
      },
    });

    // Streaming-specific actions
    if (streamingMessage?.isStreaming) {
      items.push({
        id: "interrupt",
        label: "Stop Streaming",
        icon: "⏹️",
        shortcut: "Esc",
        action: () => {
          console.log("Interrupt streaming");
          // This would call the streaming interrupt handler
        },
      });
    }

    // Select all
    items.push({
      id: "select-all",
      label: "Select All",
      icon: "🔘",
      shortcut: "Ctrl+A",
      action: () => {
        console.log("Select all action triggered");
      },
    });

    // Clear selection
    if (menuState.selectedText) {
      items.push({
        id: "clear-selection",
        label: "Clear Selection",
        icon: "❌",
        action: () => {
          console.log("Clear selection");
          setMenuState((prev) => ({ ...prev, selectedText: "" }));
        },
      });
    }

    return items;
  };

  return {
    menuState,
    showMenu,
    hideMenu,
    getDefaultItems,
  };
};

/**
 * Mouse event handlers for text selection and context menu
 */
export interface MouseEventHandlers {
  onMouseDown: (event: {
    x: number;
    y: number;
    button: "left" | "right" | "middle";
  }) => void;
  onMouseUp: (event: {
    x: number;
    y: number;
    button: "left" | "right" | "middle";
  }) => void;
  onMouseMove: (event: { x: number; y: number; isDragging: boolean }) => void;
  onDoubleClick: (event: { x: number; y: number }) => void;
}

/**
 * Enhanced mouse support component that integrates with ConversationArea
 */
export const MouseSupportLayer: React.FC<{
  children: React.ReactNode;
  onTextSelect?: (text: string) => void;
  onRightClick?: (x: number, y: number, selectedText?: string) => void;
  streamingMessage?: any;
}> = ({ children, onTextSelect, onRightClick, streamingMessage }) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectedText, setSelectedText] = useState("");

  const { menuState, showMenu, hideMenu, getDefaultItems } =
    useMouseContextMenu(streamingMessage);

  const handleMouseDown = (event: {
    x: number;
    y: number;
    button: "left" | "right" | "middle";
  }) => {
    if (event.button === "left") {
      setIsSelecting(true);
      setSelectionStart({ x: event.x, y: event.y });
      setSelectedText("");
    } else if (event.button === "right") {
      onRightClick?.(event.x, event.y, selectedText);
      showMenu(event.x, event.y, selectedText);
    }
  };

  const handleMouseUp = (event: {
    x: number;
    y: number;
    button: "left" | "right" | "middle";
  }) => {
    if (event.button === "left" && isSelecting) {
      setIsSelecting(false);
      // In a real implementation, you'd calculate the selected text based on coordinates
      const mockSelectedText = "Selected text based on coordinates";
      setSelectedText(mockSelectedText);
      onTextSelect?.(mockSelectedText);
    }
  };

  const handleMouseMove = (event: {
    x: number;
    y: number;
    isDragging: boolean;
  }) => {
    if (isSelecting && event.isDragging) {
      // Update selection visual feedback
      // In a real implementation, you'd calculate and update the selection rectangle
    }
  };

  const handleDoubleClick = (event: { x: number; y: number }) => {
    // Select word at position
    const mockWordSelection = "word";
    setSelectedText(mockWordSelection);
    onTextSelect?.(mockWordSelection);
  };

  return (
    <Box position="relative">
      {children}

      {/* Context Menu */}
      <MouseContextMenu
        isVisible={menuState.isVisible}
        x={menuState.x}
        y={menuState.y}
        items={getDefaultItems()}
        onClose={hideMenu}
        selectedText={menuState.selectedText}
        streamingContext={streamingMessage?.isStreaming || false}
      />

      {/* Selection overlay (would be implemented with actual mouse integration) */}
      {isSelecting && selectionStart && (
        <Box borderStyle="round" borderColor="cyan" backgroundColor="blue">
          <Text> </Text>
        </Box>
      )}
    </Box>
  );
};
