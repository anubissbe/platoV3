// Provider interface to work with existing Session class
export interface Provider {
  initialize(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  getModels(): Promise<string[]>;
  getEndpoint(): string;
  setEndpoint(endpoint: string): void;
}
import {
  loginCopilot,
  logoutCopilot,
  getAvailableModels,
  providerFetch,
  getAuthInfo
} from "./copilot.js";
import { loadConfig } from "../config.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

export class CopilotProvider implements Provider {
  private endpoint: string = "https://api.githubcopilot.com";
  private initialized: boolean = false;
  private token: string | null = null;
  private configPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), ".config", "plato", "config.json");
  }

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load configuration
      const config = await this.loadConfiguration();

      // Set endpoint from config or use default
      this.endpoint = config?.endpoint || this.endpoint;

      // Check for GITHUB_TOKEN in environment
      if (process.env.GITHUB_TOKEN) {
        this.token = process.env.GITHUB_TOKEN;
      } else {
        // Try to get existing token
        try {
          const authInfo = await getAuthInfo();
          if (authInfo.loggedIn) {
            // Token is valid
            this.token = "authenticated"; // We'll use providerFetch for actual requests
          }
        } catch {
          // No valid token, user will need to login
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize CopilotProvider:", error);
      // Still mark as initialized to prevent infinite loops
      this.initialized = true;
      throw error;
    }
  }

  /**
   * Load configuration from file
   */
  private async loadConfiguration(): Promise<any> {
    try {
      const configExists = await fs.access(this.configPath).then(() => true).catch(() => false);
      if (configExists) {
        const content = await fs.readFile(this.configPath, "utf8");
        return JSON.parse(content);
      }
    } catch (error) {
      // Config doesn't exist or is invalid
    }

    // Return default config
    return {
      endpoint: this.endpoint,
      model: "gpt-4",
      autoSave: true,
      theme: "auto"
    };
  }

  /**
   * Check if authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      if (this.token) {
        return true;
      }

      const authInfo = await getAuthInfo();
      return authInfo.loggedIn;
    } catch {
      return false;
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    try {
      // Use the existing getAvailableModels function from copilot.ts
      const models = await getAvailableModels();
      return models;
    } catch (error) {
      // Return default models if API call fails
      return ["gpt-4", "gpt-3.5-turbo", "gpt-4-turbo-preview"];
    }
  }

  /**
   * Get the endpoint
   */
  getEndpoint(): string {
    return this.endpoint;
  }

  /**
   * Set the endpoint
   */
  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  /**
   * Login to Copilot
   */
  async login(): Promise<void> {
    await loginCopilot();
    const authInfo = await getAuthInfo();
    if (authInfo.loggedIn) {
      this.token = "authenticated";
    }
  }

  /**
   * Logout from Copilot
   */
  async logout(): Promise<void> {
    await logoutCopilot();
    this.token = null;
  }

  /**
   * Make an authenticated request
   */
  async fetch(url: string | URL, init?: RequestInit): Promise<Response> {
    if (!this.initialized) {
      await this.initialize();
    }
    return providerFetch(url, init);
  }

  /**
   * Get provider headers for requests
   */
  async getHeaders(): Promise<Record<string, string>> {
    // Headers are handled by providerFetch automatically
    return {
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "Editor-Version": "vscode/1.99.3",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
      "Copilot-Integration-Id": "vscode-chat",
      "Content-Type": "application/json"
    };
  }

  /**
   * Get provider name
   */
  getName(): string {
    return "GitHub Copilot";
  }

  /**
   * Get provider status
   */
  async getStatus(): Promise<{
    authenticated: boolean;
    endpoint: string;
    model?: string;
    user?: string;
  }> {
    const authenticated = await this.isAuthenticated();
    const authInfo = authenticated ? await getAuthInfo() : { user: undefined };

    return {
      authenticated,
      endpoint: this.endpoint,
      user: authInfo.user?.login
    };
  }
}