import React, { useEffect, useCallback, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { MessageBubbleProps } from "./MessageBubble";

// Session data interface
interface MessageBubbleSessionData {
  messages: MessageBubbleProps[];
  focusedMessageIndex: number;
  expandedMessages: number[];
  scrollPosition: number;
  viewState: {
    showMetadata: boolean;
    showTimestamps: boolean;
    theme: string;
  };
  lastUpdated: number;
  sessionId: string;
}

// Persistence configuration
interface PersistenceConfig {
  enabled: boolean;
  autoSave: boolean;
  saveInterval: number; // milliseconds
  maxSessions: number;
  storageKey: string;
  compression: boolean;
}

// Default persistence configuration
const defaultPersistenceConfig: PersistenceConfig = {
  enabled: true,
  autoSave: true,
  saveInterval: 5000, // 5 seconds
  maxSessions: 10,
  storageKey: "plato-message-bubbles",
  compression: false,
};

// Session manager class
export class MessageBubbleSessionManager {
  private config: PersistenceConfig;
  private sessionId: string;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private isDisposed = false;

  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = { ...defaultPersistenceConfig, ...config };
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Save session data to localStorage
  public saveSession(data: Omit<MessageBubbleSessionData, "sessionId" | "lastUpdated">): void {
    if (!this.config.enabled || this.isDisposed) return;

    try {
      const sessionData: MessageBubbleSessionData = {
        ...data,
        sessionId: this.sessionId,
        lastUpdated: Date.now(),
      };

      let dataToStore = JSON.stringify(sessionData);

      // Apply compression if enabled
      if (this.config.compression) {
        dataToStore = this.compressData(dataToStore);
      }

      // Store the session
      localStorage.setItem(`${this.config.storageKey}-${this.sessionId}`, dataToStore);

      // Maintain session limit
      this.cleanupOldSessions();

      console.debug(`MessageBubble session saved: ${this.sessionId}`);
    } catch (error) {
      console.warn("Failed to save MessageBubble session:", error);
    }
  }

  // Load session data from localStorage
  public loadSession(sessionId?: string): MessageBubbleSessionData | null {
    if (!this.config.enabled) return null;

    try {
      const targetSessionId = sessionId || this.getLatestSessionId();
      if (!targetSessionId) return null;

      const key = `${this.config.storageKey}-${targetSessionId}`;
      let storedData = localStorage.getItem(key);

      if (!storedData) return null;

      // Decompress if needed
      if (this.config.compression) {
        storedData = this.decompressData(storedData);
      }

      const sessionData = JSON.parse(storedData) as MessageBubbleSessionData;

      // Validate session data structure
      if (this.validateSessionData(sessionData)) {
        console.debug(`MessageBubble session loaded: ${targetSessionId}`);
        return sessionData;
      }
    } catch (error) {
      console.warn("Failed to load MessageBubble session:", error);
    }

    return null;
  }

  // Get list of available sessions
  public getAvailableSessions(): { id: string; lastUpdated: number; messageCount: number }[] {
    if (!this.config.enabled) return [];

    const sessions: { id: string; lastUpdated: number; messageCount: number }[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.config.storageKey)) {
          const sessionId = key.replace(`${this.config.storageKey}-`, "");
          const sessionData = this.loadSession(sessionId);

          if (sessionData) {
            sessions.push({
              id: sessionId,
              lastUpdated: sessionData.lastUpdated,
              messageCount: sessionData.messages.length,
            });
          }
        }
      }

      // Sort by last updated (newest first)
      sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
    } catch (error) {
      console.warn("Failed to get available sessions:", error);
    }

    return sessions;
  }

  // Delete a specific session
  public deleteSession(sessionId: string): boolean {
    if (!this.config.enabled) return false;

    try {
      const key = `${this.config.storageKey}-${sessionId}`;
      localStorage.removeItem(key);
      console.debug(`MessageBubble session deleted: ${sessionId}`);
      return true;
    } catch (error) {
      console.warn("Failed to delete session:", error);
      return false;
    }
  }

  // Clear all sessions
  public clearAllSessions(): void {
    if (!this.config.enabled) return;

    try {
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.config.storageKey)) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.debug(`Cleared ${keysToRemove.length} MessageBubble sessions`);
    } catch (error) {
      console.warn("Failed to clear sessions:", error);
    }
  }

  // Start auto-save timer
  public startAutoSave(getData: () => Omit<MessageBubbleSessionData, "sessionId" | "lastUpdated">): void {
    if (!this.config.autoSave || this.autoSaveTimer || this.isDisposed) return;

    this.autoSaveTimer = setInterval(() => {
      if (!this.isDisposed) {
        this.saveSession(getData());
      }
    }, this.config.saveInterval);

    console.debug(`MessageBubble auto-save started (${this.config.saveInterval}ms interval)`);
  }

  // Stop auto-save timer
  public stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      console.debug("MessageBubble auto-save stopped");
    }
  }

  // Get latest session ID
  private getLatestSessionId(): string | null {
    const sessions = this.getAvailableSessions();
    return sessions.length > 0 ? sessions[0].id : null;
  }

  // Validate session data structure
  private validateSessionData(data: any): data is MessageBubbleSessionData {
    return (
      data &&
      typeof data === "object" &&
      Array.isArray(data.messages) &&
      typeof data.focusedMessageIndex === "number" &&
      Array.isArray(data.expandedMessages) &&
      typeof data.scrollPosition === "number" &&
      data.viewState &&
      typeof data.lastUpdated === "number" &&
      typeof data.sessionId === "string"
    );
  }

  // Simple compression (could be enhanced with actual compression library)
  private compressData(data: string): string {
    // Simple base64 encoding as placeholder for compression
    return btoa(data);
  }

  // Simple decompression
  private decompressData(data: string): string {
    try {
      return atob(data);
    } catch {
      return data; // Fallback if not compressed
    }
  }

  // Cleanup old sessions beyond the limit
  private cleanupOldSessions(): void {
    const sessions = this.getAvailableSessions();

    if (sessions.length > this.config.maxSessions) {
      const sessionsToDelete = sessions.slice(this.config.maxSessions);
      sessionsToDelete.forEach(session => this.deleteSession(session.id));
      console.debug(`Cleaned up ${sessionsToDelete.length} old MessageBubble sessions`);
    }
  }

  // Dispose and cleanup
  public dispose(): void {
    this.isDisposed = true;
    this.stopAutoSave();
  }

  // Get current session ID
  public getSessionId(): string {
    return this.sessionId;
  }

  // Update configuration
  public updateConfig(newConfig: Partial<PersistenceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// React hook for session persistence
export const useMessageBubbleSession = (
  messages: MessageBubbleProps[],
  focusedMessageIndex: number,
  expandedMessages: Set<number>,
  scrollPosition: number,
  viewState: MessageBubbleSessionData["viewState"],
  config?: Partial<PersistenceConfig>
): {
  sessionManager: MessageBubbleSessionManager;
  saveSession: () => void;
  loadSession: (sessionId?: string) => MessageBubbleSessionData | null;
  availableSessions: { id: string; lastUpdated: number; messageCount: number }[];
  deleteSession: (sessionId: string) => boolean;
  clearAllSessions: () => void;
} => {
  const sessionManagerRef = useRef<MessageBubbleSessionManager | null>(null);

  // Initialize session manager
  useEffect(() => {
    if (!sessionManagerRef.current) {
      sessionManagerRef.current = new MessageBubbleSessionManager(config);
    }
  }, [config]);

  // Auto-save setup
  useEffect(() => {
    const manager = sessionManagerRef.current;
    if (!manager) return;

    const getData = (): Omit<MessageBubbleSessionData, "sessionId" | "lastUpdated"> => ({
      messages,
      focusedMessageIndex,
      expandedMessages: Array.from(expandedMessages),
      scrollPosition,
      viewState,
    });

    manager.startAutoSave(getData);

    return () => {
      manager.stopAutoSave();
    };
  }, [messages, focusedMessageIndex, expandedMessages, scrollPosition, viewState]);

  // Cleanup on unmount
  useEffect(() => {
    const manager = sessionManagerRef.current;
    return () => {
      if (manager) {
        manager.dispose();
      }
    };
  }, []);

  const sessionManager = sessionManagerRef.current!;

  const saveSession = useCallback(() => {
    sessionManager.saveSession({
      messages,
      focusedMessageIndex,
      expandedMessages: Array.from(expandedMessages),
      scrollPosition,
      viewState,
    });
  }, [sessionManager, messages, focusedMessageIndex, expandedMessages, scrollPosition, viewState]);

  const loadSession = useCallback((sessionId?: string) => {
    return sessionManager.loadSession(sessionId);
  }, [sessionManager]);

  const deleteSession = useCallback((sessionId: string) => {
    return sessionManager.deleteSession(sessionId);
  }, [sessionManager]);

  const clearAllSessions = useCallback(() => {
    sessionManager.clearAllSessions();
  }, [sessionManager]);

  // Get available sessions (could be optimized with useMemo if needed)
  const availableSessions = sessionManager.getAvailableSessions();

  return {
    sessionManager,
    saveSession,
    loadSession,
    availableSessions,
    deleteSession,
    clearAllSessions,
  };
};

// React component for session management UI
export const MessageBubbleSessionControls: React.FC<{
  sessionManager: MessageBubbleSessionManager;
  onSessionLoad?: (sessionData: MessageBubbleSessionData) => void;
}> = ({ sessionManager, onSessionLoad }) => {
  const [availableSessions, setAvailableSessions] = React.useState(
    sessionManager.getAvailableSessions()
  );

  // Refresh sessions list
  const refreshSessions = useCallback(() => {
    setAvailableSessions(sessionManager.getAvailableSessions());
  }, [sessionManager]);

  // Load session
  const handleLoadSession = useCallback((sessionId: string) => {
    const sessionData = sessionManager.loadSession(sessionId);
    if (sessionData && onSessionLoad) {
      onSessionLoad(sessionData);
    }
  }, [sessionManager, onSessionLoad]);

  // Delete session
  const handleDeleteSession = useCallback((sessionId: string) => {
    if (sessionManager.deleteSession(sessionId)) {
      refreshSessions();
    }
  }, [sessionManager, refreshSessions]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  return (
    <div style={{ padding: "1rem", border: "1px solid #333", margin: "1rem 0" }}>
      <h3>Session Management</h3>

      <div style={{ marginBottom: "1rem" }}>
        <button onClick={refreshSessions} style={{ marginRight: "0.5rem" }}>
          Refresh Sessions
        </button>
        <button onClick={() => sessionManager.clearAllSessions()}>
          Clear All Sessions
        </button>
      </div>

      <div>
        <h4>Available Sessions ({availableSessions.length})</h4>
        {availableSessions.length === 0 ? (
          <p>No saved sessions found.</p>
        ) : (
          <ul>
            {availableSessions.map(session => (
              <li key={session.id} style={{ marginBottom: "0.5rem" }}>
                <span>
                  {new Date(session.lastUpdated).toLocaleString()} - {session.messageCount} messages
                </span>
                <button
                  onClick={() => handleLoadSession(session.id)}
                  style={{ marginLeft: "0.5rem", marginRight: "0.5rem" }}
                >
                  Load
                </button>
                <button onClick={() => handleDeleteSession(session.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MessageBubbleSessionManager;