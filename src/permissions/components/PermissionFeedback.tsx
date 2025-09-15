import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";

export interface PermissionFeedbackProps {
  decision?: {
    action: "allow" | "deny" | "prompt";
    tool: string;
    path?: string;
    timestamp: Date;
  };
  duration?: number;
}

/**
 * Visual feedback component for permission decisions
 * Shows temporary notifications for allow/deny actions
 */
export const PermissionFeedback: React.FC<PermissionFeedbackProps> = ({
  decision,
  duration = 3000,
}) => {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (decision) {
      setVisible(true);
      setFadeOut(false);

      // Start fade out after duration - 500ms
      const fadeTimer = setTimeout(() => {
        setFadeOut(true);
      }, duration - 500);

      // Hide completely after duration
      const hideTimer = setTimeout(() => {
        setVisible(false);
      }, duration);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [decision, duration]);

  if (!visible || !decision) {
    return null;
  }

  const getIcon = () => {
    switch (decision.action) {
      case "allow":
        return "✅";
      case "deny":
        return "❌";
      case "prompt":
        return "❓";
      default:
        return "•";
    }
  };

  const getColor = () => {
    switch (decision.action) {
      case "allow":
        return "green";
      case "deny":
        return "red";
      case "prompt":
        return "yellow";
      default:
        return "gray";
    }
  };

  const getMessage = () => {
    const action =
      decision.action === "allow"
        ? "Allowed"
        : decision.action === "deny"
          ? "Denied"
          : "Prompting";
    const tool = decision.tool;
    const path = decision.path ? ` for ${decision.path}` : "";
    return `${action} ${tool}${path}`;
  };

  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor={getColor()}
      paddingX={1}
    >
      <Text color={getColor()} bold>
        {getIcon()}
      </Text>
      <Box marginLeft={1}>
        <Text color={getColor()}>{getMessage()}</Text>
      </Box>
    </Box>
  );
};

/**
 * Permission feedback manager for queuing multiple notifications
 */
export class PermissionFeedbackManager {
  private queue: PermissionFeedbackProps["decision"][] = [];
  private current: PermissionFeedbackProps["decision"] | null = null;
  private onUpdate: (
    decision: PermissionFeedbackProps["decision"] | undefined,
  ) => void;
  private processing = false;

  constructor(
    onUpdate: (
      decision: PermissionFeedbackProps["decision"] | undefined,
    ) => void,
  ) {
    this.onUpdate = onUpdate;
  }

  /**
   * Add a decision to the feedback queue
   */
  public add(decision: PermissionFeedbackProps["decision"]) {
    this.queue.push(decision);
    this.processQueue();
  }

  /**
   * Process the feedback queue
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const decision = this.queue.shift();
      if (decision) {
        this.current = decision;
        this.onUpdate(decision);

        // Wait for feedback to complete
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    this.current = null;
    this.onUpdate(undefined);
    this.processing = false;
  }

  /**
   * Clear all pending feedback
   */
  public clear() {
    this.queue = [];
    this.current = null;
    this.onUpdate(undefined);
  }
}
