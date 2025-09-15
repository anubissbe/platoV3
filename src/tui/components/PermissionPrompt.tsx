import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import {
  PermissionQuery,
  PermissionAction,
  Rule,
  Profile,
} from "../../permissions/types.js";

export interface PermissionPromptProps {
  query: PermissionQuery;
  suggestedAction: PermissionAction;
  rule?: Rule;
  profile?: Profile;
  onDecision: (decision: "allow" | "deny" | "skip", remember?: boolean) => void;
  onElevate?: () => void;
}

export const PermissionPrompt: React.FC<PermissionPromptProps> = ({
  query,
  suggestedAction,
  rule,
  profile,
  onDecision,
  onElevate,
}) => {
  const [selectedOption, setSelectedOption] = useState<
    "allow" | "deny" | "skip"
  >("allow");
  const [remember, setRemember] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      const options: ("allow" | "deny" | "skip")[] = ["allow", "deny", "skip"];
      const currentIndex = options.indexOf(selectedOption);
      const newIndex =
        currentIndex === 0 ? options.length - 1 : currentIndex - 1;
      setSelectedOption(options[newIndex]);
    } else if (key.downArrow || input === "j") {
      const options: ("allow" | "deny" | "skip")[] = ["allow", "deny", "skip"];
      const currentIndex = options.indexOf(selectedOption);
      const newIndex = (currentIndex + 1) % options.length;
      setSelectedOption(options[newIndex]);
    } else if (key.return) {
      onDecision(selectedOption, remember);
    } else if (input === "r") {
      setRemember(!remember);
    } else if (input === "d") {
      setShowDetails(!showDetails);
    } else if (input === "e" && onElevate) {
      onElevate();
    } else if (key.escape) {
      onDecision("skip");
    }
  });

  const getRiskLevel = (): { level: string; color: string } => {
    if (query.tool === "exec" && query.command?.includes("rm -rf")) {
      return { level: "CRITICAL", color: "red" };
    }
    if (query.tool === "fs_write" && query.path?.includes(".env")) {
      return { level: "HIGH", color: "yellow" };
    }
    if (query.tool === "fs_write") {
      return { level: "MEDIUM", color: "cyan" };
    }
    return { level: "LOW", color: "green" };
  };

  const risk = getRiskLevel();

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      padding={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text color="yellow" bold>
          🔐 PERMISSION REQUEST
        </Text>
        <Box marginLeft={2}>
          <Text color={risk.color} bold>
            Risk: {risk.level}
          </Text>
        </Box>
      </Box>

      {/* Operation Details */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="cyan" bold>
            Tool:{" "}
          </Text>
          <Text color="white">{query.tool}</Text>
        </Box>
        {query.operation && (
          <Box>
            <Text color="cyan" bold>
              Operation:{" "}
            </Text>
            <Text color="white">{query.operation}</Text>
          </Box>
        )}
        {query.path && (
          <Box>
            <Text color="cyan" bold>
              Path:{" "}
            </Text>
            <Text color="white">{query.path}</Text>
          </Box>
        )}
        {query.command && (
          <Box>
            <Text color="cyan" bold>
              Command:{" "}
            </Text>
            <Text color="white">
              {query.command.substring(0, 60)}
              {query.command.length > 60 ? "..." : ""}
            </Text>
          </Box>
        )}
      </Box>

      {/* Rule Information */}
      {rule && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magenta" bold>
            Triggered Rule:
          </Text>
          <Box marginLeft={2}>
            <Text color="white">{rule.reason || "No reason provided"}</Text>
          </Box>
          {rule.priority !== undefined && (
            <Box marginLeft={2}>
              <Text color="gray">Priority: {rule.priority}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Profile Information */}
      {profile && (
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            Active Profile:{" "}
          </Text>
          <Text color="white">{profile.name}</Text>
          <Box marginLeft={2}>
            <Text color="gray" dimColor>
              ({profile.description})
            </Text>
          </Box>
        </Box>
      )}

      {/* Suggested Action */}
      <Box marginBottom={1}>
        <Text color="green" bold>
          Suggested:{" "}
        </Text>
        <Text
          color={
            suggestedAction === "allow"
              ? "green"
              : suggestedAction === "deny"
                ? "red"
                : "yellow"
          }
        >
          {suggestedAction.toUpperCase()}
        </Text>
      </Box>

      {/* Options */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="white" bold>
          Choose action:
        </Text>

        <Box marginLeft={2}>
          <Text color={selectedOption === "allow" ? "green" : "gray"}>
            {selectedOption === "allow" ? "▶ " : "  "}✓ Allow this operation
          </Text>
        </Box>

        <Box marginLeft={2}>
          <Text color={selectedOption === "deny" ? "red" : "gray"}>
            {selectedOption === "deny" ? "▶ " : "  "}✗ Deny this operation
          </Text>
        </Box>

        <Box marginLeft={2}>
          <Text color={selectedOption === "skip" ? "yellow" : "gray"}>
            {selectedOption === "skip" ? "▶ " : "  "}⏭ Skip this operation
          </Text>
        </Box>
      </Box>

      {/* Remember Option */}
      <Box marginBottom={1}>
        <Text color={remember ? "green" : "gray"}>
          [{remember ? "x" : " "}] Remember decision for similar operations
        </Text>
        <Box marginLeft={1}>
          <Text color="gray" dimColor>
            (r)
          </Text>
        </Box>
      </Box>

      {/* Additional Details */}
      {showDetails && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          padding={1}
          marginBottom={1}
        >
          <Text color="gray" bold>
            Operation Context:
          </Text>
          <Box marginLeft={2}>
            <Text color="gray">Working Directory: {process.cwd()}</Text>
          </Box>
          <Box marginLeft={2}>
            <Text color="gray">Timestamp: {new Date().toLocaleString()}</Text>
          </Box>
          {query.context?.git_context?.branch && (
            <Box marginLeft={2}>
              <Text color="gray">
                Git Branch: {query.context.git_context.branch}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Controls */}
      <Box flexDirection="column" borderTop borderColor="gray" paddingTop={1}>
        <Text color="gray" dimColor>
          Controls: ↑↓ navigate • Enter confirm • r remember • d details{" "}
          {onElevate && "• e elevate"} • Esc skip
        </Text>
      </Box>
    </Box>
  );
};

export default PermissionPrompt;
