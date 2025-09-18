import React from "react";
import { Box, Text } from "ink";
import { StyledBox, StyledText } from "../../styles/components.js";
import { getStyleManager } from "../../styles/manager.js";
import { SessionIndicator, SessionData } from "./SessionIndicator.js";
import {
  useResponsiveTerminalSize,
  useResponsiveStyles,
} from "./ResponsiveContainer.js";

export interface HeaderProps {
  // Model information
  model?: string;
  provider?: string;
  providerStatus?: "connected" | "connecting" | "disconnected" | "error";

  // Token usage and rate limiting
  tokens?: number;
  maxTokens?: number;
  rateLimit?: {
    requests: number;
    maxRequests: number;
    resetTime: Date;
  };

  // Connection status
  connectionStatus?: "connected" | "connecting" | "disconnected" | "error";
  latency?: number;
  error?: string;

  // Status line integration
  statusLineConfig?: {
    mode?: string;
    context?: string;
    session?: string;
  };
  showKeyboardShortcuts?: boolean;

  // Session information (legacy - for compatibility)
  sessionInfo?: {
    startTime: Date;
    messageCount: number;
  };

  // Enhanced session management
  sessionData?: SessionData;
  showSessionIndicator?: boolean;
  onSessionSave?: () => void;
  onSessionExport?: () => void;
  onSessionImport?: () => void;
}

/**
 * Header component providing Claude Code visual parity
 * Displays model info, token usage, connection status, and session details
 */
export const Header: React.FC<HeaderProps> = ({
  model = "unknown",
  provider = "copilot",
  providerStatus = "disconnected",
  tokens,
  maxTokens,
  rateLimit,
  connectionStatus = "disconnected",
  latency,
  error,
  statusLineConfig,
  showKeyboardShortcuts = false,
  sessionInfo,
  sessionData,
  showSessionIndicator = true,
  onSessionSave,
  onSessionExport,
  onSessionImport,
}) => {
  const manager = getStyleManager();
  const style = manager.getStyle();
  const terminalSize = useResponsiveTerminalSize();
  const responsiveStyles = useResponsiveStyles();

  // Format model and provider display
  const formatModelInfo = () => {
    const statusIcon = getProviderStatusIcon(providerStatus);
    return `${provider} ${statusIcon} ${model}`;
  };

  // Format token usage display
  const formatTokenUsage = () => {
    if (!tokens) return "--";
    if (maxTokens) {
      const percentage = Math.round((tokens / maxTokens) * 100);
      return `${tokens}/${maxTokens} (${percentage}%)`;
    }
    return `${tokens} tokens`;
  };

  // Format connection status display
  const formatConnectionStatus = () => {
    const statusIcon = getConnectionStatusIcon(connectionStatus);
    let display = `${statusIcon} ${connectionStatus}`;

    if (connectionStatus === "connected" && latency) {
      const latencyColor = latency > 1000 ? "warning" : "success";
      display += ` ${latency}ms`;
    }

    if (connectionStatus === "error" && error) {
      display += ` (${error})`;
    }

    return display;
  };

  // Format session information
  const formatSessionInfo = () => {
    if (!sessionInfo) return "";

    const duration = getDurationString(sessionInfo.startTime);
    return `${sessionInfo.messageCount} msgs | ${duration}`;
  };

  // Format rate limiting info
  const formatRateLimit = () => {
    if (!rateLimit) return "";

    const remaining = rateLimit.maxRequests - rateLimit.requests;
    return `${remaining}/${rateLimit.maxRequests} requests`;
  };

  // Compact mode for mobile terminals
  if (terminalSize.mode === "compact") {
    const staticMode =
      process.env.PLATO_STATIC_TUI === "1" ||
      process.env.PLATO_QUIET_TUI === "1";
    return (
      <StyledBox noBorder>
        <Box flexDirection="column" width="100%">
          {/* Single line header for compact mode */}
          <Box
            flexDirection="row"
            justifyContent="space-between"
            paddingX={responsiveStyles.padding}
          >
            <StyledText type="primary" bold>
              plato
            </StyledText>
            <StyledText type={getConnectionStatusType(connectionStatus)}>
              {getConnectionStatusIcon(connectionStatus)}
            </StyledText>
          </Box>
          {!staticMode && (
            <Box width="100%">
              <Text color="gray">{"─".repeat(terminalSize.columns)}</Text>
            </Box>
          )}
        </Box>
      </StyledBox>
    );
  }

  // Normal and expanded modes
  return (
    <StyledBox noBorder>
      <Box flexDirection="column" width="100%">
        {/* Main header line */}
        <Box
          flexDirection="row"
          justifyContent="space-between"
          paddingX={responsiveStyles.padding}
        >
          {/* Left side: Brand and model info */}
          <Box flexDirection="row" alignItems="center">
            <StyledText type="primary" bold>
              plato
            </StyledText>
            {responsiveStyles.showDetails && (
              <>
                <StyledText type="secondary">{" | "}</StyledText>
                <StyledText type="info">{formatModelInfo()}</StyledText>
              </>
            )}
          </Box>

          {/* Right side: Connection and session info */}
          <Box flexDirection="row" alignItems="center">
            {/* Enhanced session indicator */}
            {showSessionIndicator &&
              sessionData &&
              responsiveStyles.showTimestamps && (
                <>
                  <SessionIndicator
                    session={sessionData}
                    showSaveStatus={responsiveStyles.showMetadata}
                    showExportOption={
                      Boolean(onSessionExport) && responsiveStyles.showMetadata
                    }
                    onSave={onSessionSave}
                    onExport={onSessionExport}
                    onImport={onSessionImport}
                  />
                  <StyledText type="secondary">{" | "}</StyledText>
                </>
              )}

            {/* Legacy session info (fallback) */}
            {!sessionData && sessionInfo && responsiveStyles.showTimestamps && (
              <>
                <StyledText type="secondary">{formatSessionInfo()}</StyledText>
                <StyledText type="secondary">{" | "}</StyledText>
              </>
            )}

            <StyledText type={getConnectionStatusType(connectionStatus)}>
              {formatConnectionStatus()}
            </StyledText>
          </Box>
        </Box>

        {/* Second line: Token usage and rate limiting - only in normal/expanded mode */}
        {responsiveStyles.showDetails && (
          <Box
            flexDirection="row"
            justifyContent="space-between"
            paddingX={responsiveStyles.padding}
          >
            <Box flexDirection="row">
              <StyledText type="secondary">Tokens:</StyledText>
              <StyledText type="info">{formatTokenUsage()}</StyledText>
              {rateLimit && responsiveStyles.showMetadata && (
                <>
                  <StyledText type="secondary">{" | Rate: "}</StyledText>
                  <StyledText type="info">{formatRateLimit()}</StyledText>
                </>
              )}
            </Box>

            {/* Status line integration */}
            {statusLineConfig && responsiveStyles.showMetadata && (
              <Box flexDirection="row">
                {statusLineConfig.mode && (
                  <StyledText type="warning">
                    {statusLineConfig.mode}
                  </StyledText>
                )}
                {statusLineConfig.context && (
                  <>
                    <StyledText type="secondary"> | </StyledText>
                    <StyledText type="secondary">
                      {statusLineConfig.context}
                    </StyledText>
                  </>
                )}
              </Box>
            )}
          </Box>
        )}

        {/* Keyboard shortcuts (optional) - hide in compact mode */}
        {showKeyboardShortcuts && responsiveStyles.showDetails && (
          <Box paddingX={responsiveStyles.padding}>
            <StyledText type="secondary">
              Ctrl+C exit | Esc cancel | /help commands
            </StyledText>
          </Box>
        )}

        {/* Bottom border */}
        <Box width="100%">
          <Text color="gray">{"─".repeat(terminalSize.columns)}</Text>
        </Box>
      </Box>
    </StyledBox>
  );
};

// Helper functions
function getProviderStatusIcon(status: string): string {
  switch (status) {
    case "connected":
      return "●";
    case "connecting":
      return "◐";
    case "disconnected":
      return "○";
    case "error":
      return "✗";
    default:
      return "○";
  }
}

function getConnectionStatusIcon(status: string): string {
  switch (status) {
    case "connected":
      return "✓";
    case "connecting":
      return "…";
    case "disconnected":
      return "○";
    case "error":
      return "✗";
    default:
      return "○";
  }
}

function getConnectionStatusType(
  status: string,
): keyof import("../../styles/types.js").OutputStyleTheme {
  switch (status) {
    case "connected":
      return "success";
    case "connecting":
      return "warning";
    case "disconnected":
      return "secondary";
    case "error":
      return "error";
    default:
      return "secondary";
  }
}

function getDurationString(startTime: Date): string {
  const now = new Date();
  const diff = now.getTime() - startTime.getTime();
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}m${seconds > 0 ? ` ${seconds}s` : ""}`;
  }
  return `${seconds}s`;
}

export default Header;
