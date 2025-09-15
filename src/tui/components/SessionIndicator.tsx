import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { StyledBox, StyledText } from "../../styles/components.js";
import { getStyleManager } from "../../styles/manager.js";

export interface SessionData {
  id: string;
  timestamp: number;
  messageCount: number;
  lastSaved?: number;
  status: "active" | "saving" | "saved" | "error";
  exportable?: boolean;
}

export interface SessionIndicatorProps {
  session?: SessionData;
  showSaveStatus?: boolean;
  showExportOption?: boolean;
  autoSaveInterval?: number;
  onSave?: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

/**
 * SessionIndicator component - Visual session persistence status for header
 * Provides real-time feedback for session save/load operations and export functionality
 */
export const SessionIndicator: React.FC<SessionIndicatorProps> = ({
  session,
  showSaveStatus = true,
  showExportOption = false,
  autoSaveInterval = 30000, // 30 seconds
  onSave,
  onExport,
  onImport,
}) => {
  const [saveAnimation, setSaveAnimation] = useState(false);
  const [timeSinceLastSave, setTimeSinceLastSave] = useState<number>(0);

  const manager = getStyleManager();
  const style = manager.getStyle();

  // Auto-save countdown timer
  useEffect(() => {
    if (!session || !showSaveStatus) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const lastSave = session.lastSaved || session.timestamp;
      const timeSince = now - lastSave;
      setTimeSinceLastSave(timeSince);

      // Trigger save animation when auto-save occurs
      if (session.status === "saving" && !saveAnimation) {
        setSaveAnimation(true);
        setTimeout(() => setSaveAnimation(false), 1000);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session, showSaveStatus, saveAnimation]);

  // Format session status display
  const formatSessionStatus = () => {
    if (!session) return "No Session";

    const sessionAge = formatDuration(Date.now() - session.timestamp);
    const shortId = session.id.slice(0, 8);

    switch (session.status) {
      case "active":
        return `${shortId} (${sessionAge})`;
      case "saving":
        return `${shortId} (saving...)`;
      case "saved":
        return `${shortId} (saved)`;
      case "error":
        return `${shortId} (error)`;
      default:
        return shortId;
    }
  };

  // Format save status indicator
  const formatSaveStatus = () => {
    if (!session || !showSaveStatus) return "";

    const nextSave = autoSaveInterval - (timeSinceLastSave % autoSaveInterval);
    const nextSaveSeconds = Math.ceil(nextSave / 1000);

    if (session.status === "saving") {
      return saveAnimation ? "💾 ●" : "💾 ○";
    }

    if (session.status === "error") {
      return "⚠️ Error";
    }

    if (nextSaveSeconds <= 5) {
      return `💾 ${nextSaveSeconds}s`;
    }

    return "💾 ✓";
  };

  // Get status color
  const getStatusColor =
    (): keyof import("../../styles/types.js").OutputStyleTheme => {
      if (!session) return "secondary";

      switch (session.status) {
        case "active":
          return "primary";
        case "saving":
          return "warning";
        case "saved":
          return "success";
        case "error":
          return "error";
        default:
          return "secondary";
      }
    };

  // Format export/import indicators
  const formatDataActions = () => {
    if (!showExportOption || !session) return "";

    const actions = [];
    if (session.exportable && onExport) {
      actions.push("📤 Export");
    }
    if (onImport) {
      actions.push("📥 Import");
    }

    return actions.length > 0 ? ` | ${actions.join(" ")}` : "";
  };

  if (!session) {
    return <StyledText type="secondary">No active session</StyledText>;
  }

  return (
    <Box flexDirection="row" alignItems="center">
      {/* Session ID and age */}
      <StyledText type={getStatusColor()}>{formatSessionStatus()}</StyledText>

      {/* Save status indicator */}
      {showSaveStatus && (
        <>
          <StyledText type="secondary"> | </StyledText>
          <StyledText type={session.status === "error" ? "error" : "info"}>
            {formatSaveStatus()}
          </StyledText>
        </>
      )}

      {/* Export/Import actions */}
      {showExportOption && (
        <StyledText type="secondary">{formatDataActions()}</StyledText>
      )}
    </Box>
  );
};

/**
 * Hook for managing session state with persistence
 */
export const useSessionManagement = (initialSession?: SessionData) => {
  const [session, setSession] = useState<SessionData | undefined>(
    initialSession,
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Create new session
  const createSession = () => {
    const newSession: SessionData = {
      id: generateSessionId(),
      timestamp: Date.now(),
      messageCount: 0,
      status: "active",
      exportable: true,
    };
    setSession(newSession);
    return newSession;
  };

  // Update session data
  const updateSession = (updates: Partial<SessionData>) => {
    if (!session) return;

    setSession((prev) => (prev ? { ...prev, ...updates } : undefined));
  };

  // Save session to persistence
  const saveSession = async () => {
    if (!session) return;

    setSaveStatus("saving");
    updateSession({ status: "saving" });

    try {
      // TODO: Integrate with ContextPersistenceManager
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate save

      const savedSession = {
        ...session,
        lastSaved: Date.now(),
        status: "saved" as const,
      };

      setSession(savedSession);
      setSaveStatus("saved");

      // Reset to active after showing saved status
      setTimeout(() => {
        updateSession({ status: "active" });
        setSaveStatus("idle");
      }, 2000);
    } catch (error) {
      updateSession({ status: "error" });
      setSaveStatus("error");
    }
  };

  // Export session data
  const exportSession = async (): Promise<string | null> => {
    if (!session) return null;

    try {
      const exportData = {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        session: {
          id: session.id,
          timestamp: session.timestamp,
          messageCount: session.messageCount,
          duration: Date.now() - session.timestamp,
        },
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error("Failed to export session:", error);
      return null;
    }
  };

  // Import session data
  const importSession = async (data: string): Promise<boolean> => {
    try {
      const parsed = JSON.parse(data);

      if (!parsed.session) {
        throw new Error("Invalid session data format");
      }

      const importedSession: SessionData = {
        id: parsed.session.id || generateSessionId(),
        timestamp: parsed.session.timestamp || Date.now(),
        messageCount: parsed.session.messageCount || 0,
        status: "active",
        exportable: true,
      };

      setSession(importedSession);
      setSaveStatus("idle");
      return true;
    } catch (error) {
      console.error("Failed to import session:", error);
      return false;
    }
  };

  return {
    session,
    saveStatus,
    createSession,
    updateSession,
    saveSession,
    exportSession,
    importSession,
  };
};

// Helper functions
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export default SessionIndicator;
