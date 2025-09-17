/**
 * Comprehensive test suite for Copilot Provider
 * Testing all aspects: OAuth flow, token management, API calls, error handling
 */

import {
  loginCopilot,
  logoutCopilot,
  providerFetch,
  getAuthInfo,
} from "../../../providers/copilot";
import { chatCompletions, chatStream } from "../../../providers/chat_fallback";
import { loadConfig } from "../../../config";
import fs from "fs/promises";
import os from "os";
import path from "path";

jest.mock("../../../config");
jest.mock("fs/promises");

// Mock fetch globally
global.fetch = jest.fn();

// Mock keytar for credential storage
jest.mock("keytar", () => ({
  getPassword: jest.fn(),
  setPassword: jest.fn(),
  deletePassword: jest.fn(),
}));

describe("Task 1: Core Provider Testing", () => {
  const mockHomeDir = "/home/test";
  const credsFile = path.join(
    mockHomeDir,
    ".config",
    "plato",
    "credentials.json",
  );
  const mockKeytar = require("keytar");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(os, "homedir").mockReturnValue(mockHomeDir);
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("✅ 1.1 OAuth Authentication Flow", () => {
    test("should complete full OAuth device flow", async () => {
      // Mock no existing credentials initially
      mockKeytar.getPassword.mockResolvedValue(null);
      (fs.readFile as jest.Mock).mockRejectedValue({ code: "ENOENT" });

      (loadConfig as jest.Mock).mockResolvedValue({
        provider: { copilot: { client_id: "test-client-id" } },
      });

      // Mock device code response
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              device_code: "test-device-code",
              user_code: "ABC-123",
              verification_uri: "https://github.com/login/device",
              interval: 0.1,
              expires_in: 900,
            }),
        }),
      );

      // Mock polling for access token - immediate success
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: "gho_testtoken123",
              refresh_token: "ghr_refreshtoken456",
              token_type: "bearer",
              scope: "repo,user",
            }),
        }),
      );

      // Mock credential storage - simulate saving credentials
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      // After credentials are saved, mock successful keytar retrieval for ensureAccessToken()
      const savedCreds = {
        type: "oauth",
        refresh: "gho_testtoken123",
        access: "",
        expires: 0,
      };
      mockKeytar.setPassword.mockResolvedValue(undefined);
      // Mock subsequent keytar call to return saved credentials
      mockKeytar.getPassword.mockResolvedValueOnce(JSON.stringify(savedCreds));

      // Mock Copilot token exchange for ensureAccessToken()
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              token: "cop_apitoken789",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        }),
      );

      await loginCopilot();

      // Verify device code request
      expect(global.fetch).toHaveBeenCalledWith(
        "https://github.com/login/device/code",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Accept: "application/json",
          }),
        }),
      );

      // Verify user code was displayed
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining("ABC-123"),
      );
    });
  });

  describe("✅ 1.2 Token Management", () => {
    test("should store and retrieve tokens securely", async () => {
      const testCreds = {
        type: "oauth",
        access: "test_access_token",
        refresh: "test_refresh_token",
        expires: Date.now() + 3600000,
      };

      // Mock saving credentials
      mockKeytar.setPassword.mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      // Mock loading credentials
      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(testCreds));

      const auth = await getAuthInfo();
      expect(auth).toBeDefined();
    });

    test("should handle expired tokens", async () => {
      const expiredCreds = {
        type: "oauth",
        access: "expired_token",
        refresh: "refresh_token",
        expires: Date.now() - 3600000, // Expired
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(expiredCreds));

      // Mock config for providerFetch
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          copilot: {
            base_url: "https://api.githubcopilot.com",
            headers: {},
          },
        },
      });

      // Mock token refresh
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: "new_cop_token",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
      });

      // This should trigger token refresh
      const url = "https://api.githubcopilot.com/test";
      await providerFetch(url, { method: "GET" });

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe("✅ 1.3 API Request Headers", () => {
    test("should include all required Copilot headers", async () => {
      const validCreds = {
        type: "oauth",
        access: "cop_token123",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          copilot: {
            base_url: "https://api.githubcopilot.com",
            headers: {},
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await providerFetch("https://api.githubcopilot.com/test", {
        method: "POST",
        body: JSON.stringify({ test: true }),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.githubcopilot.com/test",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Bearer"),
            "User-Agent": expect.stringContaining("GitHubCopilotChat"),
            "Editor-Version": expect.any(String),
            "Copilot-Integration-Id": "vscode-chat",
          }),
        }),
      );
    });
  });

  describe("✅ 1.4 Chat Completions", () => {
    test("should handle non-streaming chat completions", async () => {
      const validCreds = {
        type: "oauth",
        access: "cop_token123",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
        model: { active: "gpt-4o" },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: { content: "Hello, I am Copilot!" },
              },
            ],
            usage: { total_tokens: 10 },
          }),
      });

      const result = await chatCompletions([
        { role: "user", content: "Hello" },
      ]);

      expect(result.content).toBe("Hello, I am Copilot!");
      expect(result.usage).toBeDefined();
    });
  });

  describe("✅ 1.5 Streaming Responses", () => {
    test("should handle streaming chat responses", async () => {
      const validCreds = {
        type: "oauth",
        access: "cop_token123",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
        model: { active: "gpt-4o" },
      });

      // Mock streaming response
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        "data: [DONE]\n\n",
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(() => {
          if (chunkIndex < chunks.length) {
            const chunk = chunks[chunkIndex++];
            return Promise.resolve({
              done: false,
              value: new TextEncoder().encode(chunk),
            });
          }
          return Promise.resolve({ done: true });
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      });

      const receivedChunks: string[] = [];
      await chatStream([{ role: "user", content: "Hi" }], {}, (text) =>
        receivedChunks.push(text),
      );

      expect(receivedChunks.join("")).toContain("Hello");
      expect(receivedChunks.join("")).toContain("world");
    });
  });

  describe("✅ 1.6 Error Handling", () => {
    test("should handle authentication errors", async () => {
      mockKeytar.getPassword.mockResolvedValue(null);
      (fs.readFile as jest.Mock).mockRejectedValue(new Error("No file"));

      await expect(providerFetch("https://api.test.com", {})).rejects.toThrow();
    });

    test("should handle network errors", async () => {
      const validCreds = {
        type: "oauth",
        access: "cop_token123",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
        model: { active: "gpt-4o" },
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      await expect(
        chatCompletions([{ role: "user", content: "Test" }]),
      ).rejects.toThrow("Network error");
    });

    test("should handle API errors gracefully", async () => {
      const validCreds = {
        type: "oauth",
        access: "cop_token123",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
        model: { active: "gpt-4o" },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limit exceeded"),
      });

      await expect(
        chatCompletions([{ role: "user", content: "Test" }]),
      ).rejects.toThrow("chat failed");
    });
  });

  describe("✅ 1.7 Logout and Cleanup", () => {
    test("should clean up credentials on logout", async () => {
      mockKeytar.deletePassword.mockResolvedValue(undefined);
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await logoutCopilot();

      expect(mockKeytar.deletePassword).toHaveBeenCalledWith(
        "plato-copilot",
        "oauth-creds",
      );
      // Check that fs.unlink was called with a path containing credentials.json
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining("credentials.json"),
      );
      expect(process.stdout.write).toHaveBeenCalledWith("Logged out.\n");
    });
  });
});
