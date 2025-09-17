import fs from "fs/promises";
import path from "path";
import os from "os";

export interface Provider {
  initialize(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  getModels(): Promise<string[]>;
  getEndpoint(): string;
  setEndpoint(endpoint: string): void;
}

export interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    duration?: number;
  };
}

export interface SessionState {
  messages: SessionMessage[];
  systemPrompt: string;
  provider: string;
  model: string;
  timestamp: number;
  metadata: {
    totalTokens: number;
    totalDuration: number;
    messageCount: number;
  };
}

export class Session {
  private provider: Provider | null = null;
  private messages: SessionMessage[] = [];
  private systemPrompt: string = "";
  private model: string = "gpt-4";
  private sessionFile: string;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private metadata = {
    totalTokens: 0,
    totalDuration: 0,
    messageCount: 0,
  };

  constructor(provider?: Provider) {
    this.provider = provider || null;
    this.sessionFile = path.join(process.cwd(), ".plato", "session.json");

    // Default system prompt (Claude Code parity)
    this.systemPrompt = "You are a helpful coding assistant. Be concise and accurate.";
  }

  /**
   * Initialize the session with a provider
   */
  async initialize(provider: Provider): Promise<void> {
    this.provider = provider;
    await provider.initialize();

    // Try to restore previous session
    const restored = await this.restore();
    if (!restored) {
      // Start fresh session
      this.addSystemMessage(this.systemPrompt);
    }

    // Start auto-save (30 seconds interval, matching Claude Code)
    this.startAutoSave();
  }

  /**
   * Set the provider for this session
   */
  setProvider(provider: Provider): void {
    this.provider = provider;
  }

  /**
   * Get the current provider
   */
  getProvider(): Provider | null {
    return this.provider;
  }

  /**
   * Set the system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    // Update the first message if it's a system message
    if (this.messages.length > 0 && this.messages[0].role === "system") {
      this.messages[0].content = prompt;
    } else {
      // Add system message at the beginning
      this.messages.unshift({
        role: "system",
        content: prompt,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get the system prompt
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Set the model for this session
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Get the current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Add a message to the session
   */
  addMessage(message: SessionMessage): void {
    this.messages.push(message);
    this.metadata.messageCount++;

    if (message.metadata?.tokensUsed) {
      this.metadata.totalTokens += message.metadata.tokensUsed;
    }
    if (message.metadata?.duration) {
      this.metadata.totalDuration += message.metadata.duration;
    }
  }

  /**
   * Add a system message
   */
  addSystemMessage(content: string): void {
    this.addMessage({
      role: "system",
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Add a user message
   */
  addUserMessage(content: string): void {
    this.addMessage({
      role: "user",
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Add an assistant message
   */
  addAssistantMessage(content: string, metadata?: SessionMessage["metadata"]): void {
    this.addMessage({
      role: "assistant",
      content,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Get all messages
   */
  getMessages(): SessionMessage[] {
    return this.messages;
  }

  /**
   * Clear all messages except system prompt
   */
  clear(): void {
    this.messages = [];
    this.metadata = {
      totalTokens: 0,
      totalDuration: 0,
      messageCount: 0,
    };

    // Re-add system prompt
    if (this.systemPrompt) {
      this.addSystemMessage(this.systemPrompt);
    }
  }

  /**
   * Save session to file
   */
  async save(): Promise<void> {
    try {
      const sessionDir = path.dirname(this.sessionFile);
      await fs.mkdir(sessionDir, { recursive: true });

      const state: SessionState = {
        messages: this.messages,
        systemPrompt: this.systemPrompt,
        provider: this.provider ? "copilot" : "none",
        model: this.model,
        timestamp: Date.now(),
        metadata: this.metadata,
      };

      // Compress if >1MB (Claude Code parity)
      const content = JSON.stringify(state, null, 2);
      if (content.length > 1024 * 1024) {
        // For now, just save as-is (compression can be added later)
        // TODO: Add compression support
      }

      await fs.writeFile(this.sessionFile, content, "utf8");
    } catch (error) {
      // Silent fail - don't interrupt user flow
      console.error("Failed to save session:", error);
    }
  }

  /**
   * Restore session from file
   */
  async restore(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.sessionFile, "utf8");
      const state: SessionState = JSON.parse(content);

      // Check if session is <24h old (Claude Code parity)
      const age = Date.now() - state.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (age > maxAge) {
        // Archive old session and start fresh
        const archiveDir = path.join(
          process.cwd(),
          ".plato",
          "sessions",
          new Date(state.timestamp).toISOString().split("T")[0]
        );
        await fs.mkdir(archiveDir, { recursive: true });
        const archiveFile = path.join(
          archiveDir,
          `session-${state.timestamp}.json`
        );
        await fs.rename(this.sessionFile, archiveFile);
        return false;
      }

      // Restore session state
      this.messages = state.messages;
      this.systemPrompt = state.systemPrompt;
      this.model = state.model;
      this.metadata = state.metadata;

      return true;
    } catch (error) {
      // No previous session or error reading
      return false;
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    // Auto-save every 30 seconds (Claude Code parity)
    this.autoSaveInterval = setInterval(() => {
      this.save().catch(() => {
        // Silent fail
      });
    }, 30000);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * Get session metadata
   */
  getMetadata() {
    return {
      ...this.metadata,
      sessionAge: this.messages.length > 0
        ? Date.now() - this.messages[0].timestamp
        : 0,
    };
  }

  /**
   * Export session for handoff
   */
  async exportForHandoff(): Promise<string> {
    const state = {
      messages: this.messages,
      systemPrompt: this.systemPrompt,
      model: this.model,
      timestamp: Date.now(),
      metadata: this.metadata,
    };
    return JSON.stringify(state, null, 2);
  }

  /**
   * Import session from handoff
   */
  async importFromHandoff(data: string): Promise<void> {
    try {
      const state = JSON.parse(data);
      this.messages = state.messages || [];
      this.systemPrompt = state.systemPrompt || this.systemPrompt;
      this.model = state.model || this.model;
      this.metadata = state.metadata || this.metadata;
    } catch (error) {
      throw new Error(`Failed to import session: ${error}`);
    }
  }

  /**
   * Cleanup on exit
   */
  async cleanup(): Promise<void> {
    this.stopAutoSave();
    await this.save();
  }
}