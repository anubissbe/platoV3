import React, { createContext, useContext, useReducer, useEffect } from "react";
import { useInput } from "ink";

// Action types for keyboard interactions
export type MessageBubbleAction =
  | { type: "FOCUS_MESSAGE"; index: number }
  | { type: "EXPAND_MESSAGE"; index: number }
  | { type: "COLLAPSE_MESSAGE"; index: number }
  | { type: "COPY_MESSAGE"; index: number }
  | { type: "SELECT_TEXT"; index: number; text: string }
  | { type: "NAVIGATE_UP" }
  | { type: "NAVIGATE_DOWN" }
  | { type: "TOGGLE_HELP" }
  | { type: "SCROLL_TO_TOP" }
  | { type: "SCROLL_TO_BOTTOM" };

// State interface for keyboard navigation
export interface MessageBubbleKeyboardState {
  focusedMessageIndex: number;
  expandedMessages: Set<number>;
  selectedText: string | null;
  helpVisible: boolean;
  messageCount: number;
  keyboardEnabled: boolean;
}

// Initial state
const initialState: MessageBubbleKeyboardState = {
  focusedMessageIndex: 0,
  expandedMessages: new Set(),
  selectedText: null,
  helpVisible: false,
  messageCount: 0,
  keyboardEnabled: true,
};

// Reducer for managing keyboard state
const keyboardReducer = (
  state: MessageBubbleKeyboardState,
  action: MessageBubbleAction
): MessageBubbleKeyboardState => {
  switch (action.type) {
    case "FOCUS_MESSAGE":
      return {
        ...state,
        focusedMessageIndex: Math.max(0, Math.min(action.index, state.messageCount - 1)),
      };

    case "EXPAND_MESSAGE":
      return {
        ...state,
        expandedMessages: new Set([...state.expandedMessages, action.index]),
      };

    case "COLLAPSE_MESSAGE":
      const newExpanded = new Set(state.expandedMessages);
      newExpanded.delete(action.index);
      return {
        ...state,
        expandedMessages: newExpanded,
      };

    case "COPY_MESSAGE":
      // Note: Actual copy functionality would be handled by the component
      return {
        ...state,
        selectedText: `Message ${action.index} copied`,
      };

    case "SELECT_TEXT":
      return {
        ...state,
        selectedText: action.text,
      };

    case "NAVIGATE_UP":
      return {
        ...state,
        focusedMessageIndex: Math.max(0, state.focusedMessageIndex - 1),
      };

    case "NAVIGATE_DOWN":
      return {
        ...state,
        focusedMessageIndex: Math.min(state.messageCount - 1, state.focusedMessageIndex + 1),
      };

    case "TOGGLE_HELP":
      return {
        ...state,
        helpVisible: !state.helpVisible,
      };

    case "SCROLL_TO_TOP":
      return {
        ...state,
        focusedMessageIndex: 0,
      };

    case "SCROLL_TO_BOTTOM":
      return {
        ...state,
        focusedMessageIndex: Math.max(0, state.messageCount - 1),
      };

    default:
      return state;
  }
};

// Context for keyboard handling
export const MessageBubbleKeyboardContext = createContext<{
  state: MessageBubbleKeyboardState;
  dispatch: React.Dispatch<MessageBubbleAction>;
  isMessageFocused: (index: number) => boolean;
  isMessageExpanded: (index: number) => boolean;
  toggleMessageExpansion: (index: number) => void;
  copyMessage: (index: number) => void;
} | null>(null);

// Hook for using keyboard context
export const useMessageBubbleKeyboard = () => {
  const context = useContext(MessageBubbleKeyboardContext);
  if (!context) {
    throw new Error("useMessageBubbleKeyboard must be used within a MessageBubbleKeyboardProvider");
  }
  return context;
};

// Provider component
export const MessageBubbleKeyboardProvider: React.FC<{
  children: React.ReactNode;
  messageCount: number;
  onAction?: (action: MessageBubbleAction) => void;
  keyboardEnabled?: boolean;
}> = ({ children, messageCount, onAction, keyboardEnabled = true }) => {
  const [state, dispatch] = useReducer(keyboardReducer, {
    ...initialState,
    messageCount,
    keyboardEnabled,
  });

  // Update message count when it changes
  useEffect(() => {
    if (state.messageCount !== messageCount) {
      // Reset focused index if it's out of bounds
      if (state.focusedMessageIndex >= messageCount) {
        dispatch({ type: "FOCUS_MESSAGE", index: Math.max(0, messageCount - 1) });
      }
    }
  }, [messageCount, state.focusedMessageIndex, state.messageCount]);

  // Keyboard input handling
  useInput((input, key) => {
    if (!keyboardEnabled) return;

    let actionToDispatch: MessageBubbleAction | null = null;

    // Navigation keys
    if (key.upArrow) {
      actionToDispatch = { type: "NAVIGATE_UP" };
    } else if (key.downArrow) {
      actionToDispatch = { type: "NAVIGATE_DOWN" };
    }
    // Home/End keys
    else if (key.pageUp || (key.ctrl && input === "a")) {
      actionToDispatch = { type: "SCROLL_TO_TOP" };
    } else if (key.pageDown || (key.ctrl && input === "e")) {
      actionToDispatch = { type: "SCROLL_TO_BOTTOM" };
    }
    // Expansion/collapse
    else if (key.return || input === " ") {
      const isExpanded = state.expandedMessages.has(state.focusedMessageIndex);
      actionToDispatch = isExpanded
        ? { type: "COLLAPSE_MESSAGE", index: state.focusedMessageIndex }
        : { type: "EXPAND_MESSAGE", index: state.focusedMessageIndex };
    }
    // Copy functionality
    else if (input === "c" && key.ctrl) {
      actionToDispatch = { type: "COPY_MESSAGE", index: state.focusedMessageIndex };
    }
    // Help toggle
    else if (input === "?" || key.f1) {
      actionToDispatch = { type: "TOGGLE_HELP" };
    }
    // Number keys for direct message focus
    else if (/^[1-9]$/.test(input)) {
      const messageIndex = parseInt(input) - 1;
      if (messageIndex < messageCount) {
        actionToDispatch = { type: "FOCUS_MESSAGE", index: messageIndex };
      }
    }

    if (actionToDispatch) {
      dispatch(actionToDispatch);
      if (onAction) {
        onAction(actionToDispatch);
      }
    }
  });

  // Helper functions
  const isMessageFocused = (index: number) => state.focusedMessageIndex === index;
  const isMessageExpanded = (index: number) => state.expandedMessages.has(index);

  const toggleMessageExpansion = (index: number) => {
    const action = state.expandedMessages.has(index)
      ? { type: "COLLAPSE_MESSAGE" as const, index }
      : { type: "EXPAND_MESSAGE" as const, index };
    dispatch(action);
    if (onAction) onAction(action);
  };

  const copyMessage = (index: number) => {
    const action = { type: "COPY_MESSAGE" as const, index };
    dispatch(action);
    if (onAction) onAction(action);
  };

  const contextValue = {
    state: { ...state, messageCount },
    dispatch,
    isMessageFocused,
    isMessageExpanded,
    toggleMessageExpansion,
    copyMessage,
  };

  return (
    <MessageBubbleKeyboardContext.Provider value={contextValue}>
      {children}
    </MessageBubbleKeyboardContext.Provider>
  );
};

// Keyboard shortcut help component
export const MessageBubbleKeyboardHelp: React.FC = () => {
  const { state } = useMessageBubbleKeyboard();

  if (!state.helpVisible) return null;

  return (
    <div style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#000",
      border: "1px solid #333",
      padding: "1rem",
      borderRadius: "4px",
      zIndex: 1000,
    }}>
      <h3>MessageBubble Keyboard Shortcuts</h3>
      <ul>
        <li>↑/↓ - Navigate between messages</li>
        <li>Enter/Space - Expand/collapse message</li>
        <li>Ctrl+C - Copy message content</li>
        <li>1-9 - Jump to message by number</li>
        <li>Ctrl+A/Page Up - Jump to first message</li>
        <li>Ctrl+E/Page Down - Jump to last message</li>
        <li>? or F1 - Toggle this help</li>
      </ul>
    </div>
  );
};

// Custom hook for keyboard shortcuts in message bubbles
export const useMessageBubbleShortcuts = (messageIndex: number) => {
  const { isMessageFocused, isMessageExpanded, toggleMessageExpansion, copyMessage } =
    useMessageBubbleKeyboard();

  const isFocused = isMessageFocused(messageIndex);
  const isExpanded = isMessageExpanded(messageIndex);

  const handleToggle = () => toggleMessageExpansion(messageIndex);
  const handleCopy = () => copyMessage(messageIndex);

  return {
    isFocused,
    isExpanded,
    handleToggle,
    handleCopy,
  };
};

export default MessageBubbleKeyboardProvider;