import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { PermissionQuery, PermissionDecision, RiskLevel } from "../types";

export interface PermissionPromptProps {
  query: PermissionQuery;
  onResponse: (decision: PermissionDecision) => void;
  onCancel: () => void;
  riskLevel?: RiskLevel;
  ruleExplanation?: string;
  operationPreview?: string;
  allowTemporaryElevation?: boolean;
  showKeyboardHelp?: boolean;
  isProcessing?: boolean;
  autoDenyTimeout?: number;
  affectedFiles?: number;
  matchedRule?: {
    id: string;
    name: string;
    pattern: string;
    action: string;
    priority?: number;
  };
  conflictingRules?: Array<{ id: string; name: string; priority?: number }>;
  triggerReason?: string;
  elevationOptions?: Array<{ label: string; duration: number }>;
  allowCustomDuration?: boolean;
  currentElevation?: {
    active: boolean;
    remainingTime: number;
    scope: string;
  };
  announceToScreenReader?: boolean;
  highContrastMode?: boolean;
}

const getRiskColor = (level?: RiskLevel): string => {
  switch (level) {
    case "low":
      return "green";
    case "medium":
      return "yellow";
    case "high":
      return "red";
    case "critical":
      return "redBright";
    default:
      return "yellow";
  }
};

const getRiskEmoji = (level?: RiskLevel): string => {
  switch (level) {
    case "low":
      return "✓";
    case "medium":
      return "⚠";
    case "high":
      return "⚠️";
    case "critical":
      return "🚨";
    default:
      return "⚠";
  }
};

export const PermissionPrompt: React.FC<PermissionPromptProps> = ({
  query,
  onResponse,
  onCancel,
  riskLevel = "medium",
  ruleExplanation,
  operationPreview,
  allowTemporaryElevation = false,
  showKeyboardHelp = true,
  isProcessing = false,
  autoDenyTimeout,
  affectedFiles,
  matchedRule,
  conflictingRules,
  triggerReason,
  elevationOptions = [
    { label: "5 minutes", duration: 300000 },
    { label: "15 minutes", duration: 900000 },
    { label: "1 hour", duration: 3600000 },
  ],
  allowCustomDuration = false,
  currentElevation,
  announceToScreenReader = false,
  highContrastMode = false,
}) => {
  const [selectedOption, setSelectedOption] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(autoDenyTimeout);
  const [showElevationMenu, setShowElevationMenu] = useState(false);
  const [customDuration, setCustomDuration] = useState("");
  const [enteringCustomDuration, setEnteringCustomDuration] = useState(false);

  // Handle invalid query
  if (!query) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        padding={1}
      >
        <Text color="red" bold>
          Invalid permission request
        </Text>
        <Text>The permission query is missing or invalid.</Text>
      </Box>
    );
  }

  // Auto-deny timeout
  useEffect(() => {
    if (autoDenyTimeout && timeRemaining && timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(timeRemaining - 1);
      }, 1000);

      if (timeRemaining === 1) {
        onResponse({
          action: "deny",
          permanent: false,
          reason: "timeout",
          timestamp: Date.now(),
        });
      }

      return () => clearTimeout(timer);
    }
  }, [timeRemaining, autoDenyTimeout, onResponse]);

  const handleResponse = useCallback(
    (
      action: "allow" | "deny",
      permanent: boolean = false,
      elevate?: boolean,
      duration?: number,
    ) => {
      const decision: PermissionDecision = {
        action,
        permanent,
        timestamp: Date.now(),
      };

      if (elevate) {
        decision.elevate = true;
        decision.duration = duration || 300000; // Default 5 minutes
      }

      onResponse(decision);
    },
    [onResponse],
  );

  // Keyboard input handling
  useInput((input, key) => {
    if (isProcessing) return;

    if (enteringCustomDuration) {
      if (key.return) {
        const minutes = parseInt(customDuration, 10);
        if (!isNaN(minutes) && minutes > 0) {
          handleResponse("allow", false, true, minutes * 60000);
          setEnteringCustomDuration(false);
        }
      } else if (key.escape) {
        setEnteringCustomDuration(false);
        setCustomDuration("");
      } else if (input && /\d/.test(input)) {
        setCustomDuration(customDuration + input);
      } else if (key.backspace || key.delete) {
        setCustomDuration(customDuration.slice(0, -1));
      }
      return;
    }

    if (showElevationMenu) {
      if (key.escape) {
        setShowElevationMenu(false);
      } else if (key.upArrow) {
        setSelectedOption(Math.max(0, selectedOption - 1));
      } else if (key.downArrow) {
        setSelectedOption(
          Math.min(elevationOptions.length - 1, selectedOption + 1),
        );
      } else if (key.return || input === " ") {
        const selected = elevationOptions[selectedOption];
        handleResponse("allow", false, true, selected.duration);
        setShowElevationMenu(false);
      } else if (input === "c" && allowCustomDuration) {
        setEnteringCustomDuration(true);
        setShowElevationMenu(false);
      }
      return;
    }

    // Main menu keyboard handling
    switch (input) {
      case "y":
        handleResponse("allow", false);
        break;
      case "Y":
        handleResponse("allow", true);
        break;
      case "n":
        handleResponse("deny", false);
        break;
      case "N":
        handleResponse("deny", true);
        break;
      case "t":
      case "T":
        if (allowTemporaryElevation) {
          setShowElevationMenu(true);
          setSelectedOption(0);
        }
        break;
      case "e":
        if (allowTemporaryElevation && allowCustomDuration) {
          setEnteringCustomDuration(true);
        }
        break;
      case "?":
      case "h":
        // Toggle help display
        break;
    }

    if (key.escape) {
      onCancel();
    } else if (key.tab) {
      // Tab navigation
      setSelectedOption((selectedOption + 1) % 3);
    } else if (key.upArrow) {
      setSelectedOption(Math.max(0, selectedOption - 1));
    } else if (key.downArrow) {
      setSelectedOption(Math.min(2, selectedOption + 1));
    } else if (key.return || input === " ") {
      if (selectedOption === 0) {
        handleResponse("allow", false);
      } else if (selectedOption === 1) {
        handleResponse("deny", false);
      } else if (selectedOption === 2) {
        onCancel();
      }
    }
  });

  const riskColor = getRiskColor(riskLevel);
  const riskEmoji = getRiskEmoji(riskLevel);

  if (isProcessing) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        padding={1}
      >
        <Text color="cyan" bold>
          Processing...
        </Text>
        <Text>Please wait while your decision is being processed.</Text>
      </Box>
    );
  }

  if (enteringCustomDuration) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        padding={1}
      >
        <Text bold>Enter elevation duration (minutes):</Text>
        <Text color="cyan">{customDuration || "▌"}</Text>
        <Text dimColor>Press Enter to confirm, ESC to cancel</Text>
      </Box>
    );
  }

  if (showElevationMenu) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        padding={1}
      >
        <Text bold>Select elevation duration:</Text>
        <Box flexDirection="column" marginTop={1}>
          {elevationOptions.map((option, index) => (
            <Text
              key={index}
              color={selectedOption === index ? "cyan" : undefined}
            >
              {selectedOption === index ? "▶ " : "  "}
              {option.label}
            </Text>
          ))}
          {allowCustomDuration && (
            <Text
              color={
                selectedOption === elevationOptions.length ? "cyan" : undefined
              }
            >
              {selectedOption === elevationOptions.length ? "▶ " : "  "}[C]
              Custom duration
            </Text>
          )}
        </Box>
        <Box paddingTop={1}>
          <Text dimColor>
            Use arrow keys to navigate, Enter to select, ESC to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={riskColor}
      padding={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={riskColor}>
          {riskEmoji} Permission Request
        </Text>
        {timeRemaining && (
          <Text color="yellow">Auto-deny in {timeRemaining}s</Text>
        )}
      </Box>

      {/* Current Elevation Status */}
      {currentElevation?.active && (
        <Box marginBottom={1}>
          <Text color="cyan">
            ⚡ Elevated permissions active (
            {Math.floor(currentElevation.remainingTime / 60000)} minutes
            remaining)
          </Text>
        </Box>
      )}

      {/* Query Details */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text bold>Tool: </Text>
          <Text color="cyan">{query.tool}</Text>
        </Text>
        <Text>
          <Text bold>Operation: </Text>
          <Text color="yellow">{query.operation}</Text>
        </Text>
        {query.path && (
          <Text>
            <Text bold>Path: </Text>
            <Text color={riskLevel === "critical" ? "red" : "white"}>
              {query.path}
            </Text>
          </Text>
        )}
        {affectedFiles && (
          <Text>
            <Text bold>Affected: </Text>
            <Text color="magenta">{affectedFiles} files</Text>
          </Text>
        )}
      </Box>

      {/* Risk Assessment */}
      <Box marginBottom={1}>
        <Text bold>Risk Level: </Text>
        <Text color={riskColor} bold>
          {riskLevel.toUpperCase()}
        </Text>
      </Box>

      {/* Rule Information */}
      {matchedRule && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Matched Rule:</Text>
          <Text color="cyan"> {matchedRule.name}</Text>
          <Text dimColor> Pattern: {matchedRule.pattern}</Text>
          {matchedRule.priority && (
            <Text dimColor> Priority: {matchedRule.priority}</Text>
          )}
          {conflictingRules && conflictingRules.length > 0 && (
            <Text dimColor>
              {" "}
              Overrides {conflictingRules.length} lower priority rule(s)
            </Text>
          )}
        </Box>
      )}

      {/* Trigger Reason */}
      {triggerReason && (
        <Box marginBottom={1}>
          <Text dimColor>Triggered because: </Text>
          <Text>{triggerReason}</Text>
        </Box>
      )}

      {/* Rule Explanation */}
      {ruleExplanation && (
        <Box marginBottom={1}>
          <Text dimColor>{ruleExplanation}</Text>
        </Box>
      )}

      {/* Operation Preview */}
      {operationPreview && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold dimColor>
            Preview:
          </Text>
          <Text color="cyan">{operationPreview}</Text>
        </Box>
      )}

      {/* Dangerous Pattern Warning */}
      {riskLevel === "critical" && (
        <Box
          marginBottom={1}
          borderStyle="double"
          borderColor="red"
          padding={1}
        >
          <Text color="red" bold>
            ⚠️ DANGER: This operation could cause irreversible damage!
          </Text>
        </Box>
      )}

      {/* Action Options */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Choose action:</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text color={selectedOption === 0 ? "green" : undefined}>
            {selectedOption === 0 ? "▶ " : "  "}[Y] Allow once
          </Text>
          <Text color={selectedOption === 1 ? "red" : undefined}>
            {selectedOption === 1 ? "▶ " : "  "}[N] Deny once
          </Text>
          <Text dimColor>
            {selectedOption === 2 ? "▶ " : "  "}[ESC] Cancel
          </Text>
        </Box>
      </Box>

      {/* Additional Options */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Hold Shift for permanent decision (Y/N)</Text>
        {allowTemporaryElevation && (
          <Text dimColor>[T] Request temporary elevation</Text>
        )}
      </Box>

      {/* Keyboard Help */}
      {showKeyboardHelp && (
        <Box
          marginTop={1}
          paddingTop={1}
          borderStyle="single"
          borderColor="gray"
        >
          <Text dimColor>
            ↑↓ Navigate • Enter/Space Select • Tab Cycle • ? Help
          </Text>
        </Box>
      )}
    </Box>
  );
};
