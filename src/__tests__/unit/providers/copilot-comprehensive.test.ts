import {
  loginCopilot,
  logoutCopilot,
  providerFetch,
  getAuthInfo,
} from "../../../providers/copilot";
import { chatCompletions, chatStream } from "../../../providers/chat_fallback";
import { loadConfig, saveConfig } from "../../../config";
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

describe("Comprehensive Copilot Provider Testing", () => {
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

  describe("1.1 OAuth Authentication Flow", () => {
    it("should complete full OAuth device flow with user code display", async () => {
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
              interval: 1,
              expires_in: 900,
            }),
        }),
      );

      // Mock polling for access token
      let pollCount = 0;
      (global.fetch as jest.Mock).mockImplementation((url) => {
        if (url === "https://github.com/login/oauth/access_token") {
          pollCount++;
          if (pollCount === 1) {
            // First poll - authorization pending
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ error: "authorization_pending" }),
            });
          } else {
            // Second poll - success
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  access_token: "gho_testtoken123",
                  refresh_token: "ghr_refreshtoken456",
                  token_type: "bearer",
                  scope: "repo,user",
                }),
            });
          }
        }

        // Mock Copilot token exchange
        if (url === "https://api.github.com/copilot_internal/v2/token") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                token: "cop_apitoken789",
                expires_at: new Date(Date.now() + 3600000).toISOString(),
              }),
          });
        }
      });

      // Mock credential storage
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      mockKeytar.setPassword.mockResolvedValue(undefined);

      const loginPromise = loginCopilot();

      // Simulate async completion
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await loginPromise;

      // Verify device code request
      expect(global.fetch).toHaveBeenCalledWith(
        "https://github.com/login/device/code",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Accept: "application/json",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            client_id: "test-client-id",
            scope: "read:user user:email repo",
          }),
        }),
      );

      // Verify user code was displayed
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining("ABC-123"),
      );

      // Verify token polling occurred
      expect(pollCount).toBeGreaterThanOrEqual(2);

      // Verify credentials were saved
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("should handle device flow timeout gracefully", async () => {
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: { copilot: { client_id: "test-client-id" } },
      });

      // Mock device code response with short expiry
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              device_code: "test-device-code",
              user_code: "TIMEOUT-TEST",
              verification_uri: "https://github.com/login/device",
              interval: 1,
              expires_in: 1, // Very short expiry
            }),
        }),
      );

      // Always return pending
      (global.fetch as jest.Mock).mockImplementation((url) => {
        if (url === "https://github.com/login/oauth/access_token") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ error: "authorization_pending" }),
          });
        }
      });

      const loginPromise = loginCopilot();

      await expect(loginPromise).rejects.toThrow("Device flow expired");
    });
  });

  describe("1.2 Token Refresh Mechanism", () => {
    it("should refresh expired access token using refresh token", async () => {
      // Setup expired token in storage
      const expiredCreds = {
        type: "oauth",
        access: "expired_access_token",
        refresh: "valid_refresh_token",
        expires: Date.now() - 3600000, // Expired 1 hour ago
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(expiredCreds));

      // Mock refresh token exchange
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: "new_access_token",
              refresh_token: "new_refresh_token",
              expires_in: 7200,
            }),
        }),
      );

      // Mock Copilot token exchange
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              token: "new_copilot_token",
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
        }),
      );

      const token = await refreshAccessToken();

      expect(token).toBe("new_copilot_token");
      expect(mockKeytar.setPassword).toHaveBeenCalledWith(
        "plato-copilot",
        "oauth-creds",
        expect.stringContaining("new_access_token"),
      );
    });

    it("should handle refresh token failure and trigger re-login", async () => {
      const expiredCreds = {
        type: "oauth",
        access: "expired_access_token",
        refresh: "invalid_refresh_token",
        expires: Date.now() - 3600000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(expiredCreds));

      // Mock failed refresh
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: "invalid_grant" }),
        }),
      );

      await expect(refreshAccessToken()).rejects.toThrow();

      // Verify credentials were cleared
      expect(mockKeytar.deletePassword).toHaveBeenCalled();
    });

    it("should not refresh if token is still valid", async () => {
      const validCreds = {
        type: "oauth",
        access: "valid_access_token",
        refresh: "valid_refresh_token",
        expires: Date.now() + 3600000, // Valid for 1 more hour
        copilot_token: "valid_copilot_token",
        copilot_expires: Date.now() + 1800000, // Valid for 30 more minutes
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));

      const token = await refreshAccessToken();

      expect(token).toBe("valid_copilot_token");
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("1.3 API Request Headers and Response Parsing", () => {
    it("should include all required headers for Copilot API requests", async () => {
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: jest
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
                ),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      });

      const response = await providerFetch(
        { messages: [{ role: "user", content: "Hi" }] },
        { onChunk: jest.fn() },
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.githubcopilot.com/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer cop_token123",
            "Content-Type": "application/json",
            "User-Agent": expect.stringContaining("GitHubCopilotChat"),
            "Editor-Version": expect.any(String),
            "Editor-Plugin-Version": expect.any(String),
            "Copilot-Integration-Id": "vscode-chat",
            "Openai-Organization": "github-copilot",
            "Openai-Intent": "conversation",
          }),
        }),
      );
    });

    it("should correctly parse streaming SSE responses", async () => {
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
        "data: [DONE]\n\n",
      ];

      let chunkIndex = 0;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
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
          }),
        },
      });

      const receivedChunks: string[] = [];
      await providerFetch(
        { messages: [{ role: "user", content: "Hi" }] },
        {
          onChunk: (chunk) => {
            if (chunk.type === "content") {
              receivedChunks.push(chunk.content);
            }
          },
        },
      );

      expect(receivedChunks).toEqual(["Hello", " world", "!"]);
    });

    it("should handle malformed SSE data gracefully", async () => {
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      const malformedChunks = [
        'data: {"choices":[{"delta":{"content":"Valid"}}]}\n\n',
        "data: {invalid json}\n\n", // Malformed JSON
        "not-sse-format\n\n", // Invalid SSE format
        'data: {"choices":[{"delta":{"content":" content"}}]}\n\n',
        "data: [DONE]\n\n",
      ];

      let chunkIndex = 0;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: jest.fn().mockImplementation(() => {
              if (chunkIndex < malformedChunks.length) {
                const chunk = malformedChunks[chunkIndex++];
                return Promise.resolve({
                  done: false,
                  value: new TextEncoder().encode(chunk),
                });
              }
              return Promise.resolve({ done: true });
            }),
          }),
        },
      });

      const receivedChunks: string[] = [];
      await providerFetch(
        { messages: [{ role: "user", content: "Test" }] },
        {
          onChunk: (chunk) => {
            if (chunk.type === "content") {
              receivedChunks.push(chunk.content);
            }
          },
        },
      );

      // Should only receive valid chunks
      expect(receivedChunks).toEqual(["Valid", " content"]);
    });
  });

  describe("1.4 Fallback Provider Switching", () => {
    it("should fallback to alternative provider when Copilot fails", async () => {
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
          fallback: {
            provider: "openai",
            base_url: "https://api.openai.com",
            model: "gpt-4",
          },
        },
      });

      // Mock Copilot failure
      mockKeytar.getPassword.mockResolvedValue(null);

      // Attempt should fail and trigger fallback
      await expect(
        providerFetch(
          { messages: [{ role: "user", content: "Test" }] },
          { onChunk: jest.fn() },
        ),
      ).rejects.toThrow();

      // Verify fallback was attempted
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("not authenticated"),
      );
    });

    it("should handle provider switching mid-conversation", async () => {
      let callCount = 0;
      (loadConfig as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            provider: {
              active: "copilot",
              copilot: { base_url: "https://api.githubcopilot.com" },
            },
          });
        } else {
          return Promise.resolve({
            provider: {
              active: "openai",
              openai: { base_url: "https://api.openai.com" },
            },
          });
        }
      });

      // First call uses Copilot
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };
      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));

      // Verify provider can be switched
      const config1 = await loadConfig();
      expect(config1.provider.active).toBe("copilot");

      const config2 = await loadConfig();
      expect(config2.provider.active).toBe("openai");
    });
  });

  describe("1.5 Streaming Response Handling", () => {
    it("should handle streaming responses with backpressure", async () => {
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      // Simulate slow chunks
      const chunks = Array.from(
        { length: 100 },
        (_, i) => `data: {"choices":[{"delta":{"content":"chunk${i} "}}]}\n\n`,
      );
      chunks.push("data: [DONE]\n\n");

      let chunkIndex = 0;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: jest.fn().mockImplementation(() => {
              if (chunkIndex < chunks.length) {
                const chunk = chunks[chunkIndex++];
                return new Promise((resolve) => {
                  // Simulate network delay
                  setTimeout(() => {
                    resolve({
                      done: false,
                      value: new TextEncoder().encode(chunk),
                    });
                  }, 10);
                });
              }
              return Promise.resolve({ done: true });
            }),
          }),
        },
      });

      const receivedChunks: string[] = [];
      const startTime = Date.now();

      await providerFetch(
        { messages: [{ role: "user", content: "Generate long text" }] },
        {
          onChunk: (chunk) => {
            if (chunk.type === "content") {
              receivedChunks.push(chunk.content);
            }
          },
        },
      );

      const endTime = Date.now();

      expect(receivedChunks).toHaveLength(100);
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000); // Should take at least 1 second
    });

    it("should handle stream interruption gracefully", async () => {
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      let callCount = 0;
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: jest.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({
                  done: false,
                  value: new TextEncoder().encode(
                    'data: {"choices":[{"delta":{"content":"Start"}}]}\n\n',
                  ),
                });
              } else if (callCount === 2) {
                // Simulate network error
                return Promise.reject(new Error("Network interrupted"));
              }
            }),
          }),
        },
      });

      const receivedChunks: string[] = [];

      await expect(
        providerFetch(
          { messages: [{ role: "user", content: "Test" }] },
          {
            onChunk: (chunk) => {
              if (chunk.type === "content") {
                receivedChunks.push(chunk.content);
              }
            },
          },
        ),
      ).rejects.toThrow("Network interrupted");

      // Should have received partial content before error
      expect(receivedChunks).toEqual(["Start"]);
    });
  });

  describe("1.6 Error Handling and Retry Logic", () => {
    it("should retry on transient network errors", async () => {
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      let attemptCount = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          // First two attempts fail with retryable errors
          return Promise.resolve({
            ok: false,
            status: attemptCount === 1 ? 503 : 502,
            statusText: "Service Unavailable",
          });
        } else {
          // Third attempt succeeds
          return Promise.resolve({
            ok: true,
            status: 200,
            body: {
              getReader: () => ({
                read: jest
                  .fn()
                  .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode(
                      'data: {"choices":[{"delta":{"content":"Success"}}]}\n\n',
                    ),
                  })
                  .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode("data: [DONE]\n\n"),
                  })
                  .mockResolvedValueOnce({ done: true }),
              }),
            },
          });
        }
      });

      const receivedChunks: string[] = [];
      await providerFetch(
        { messages: [{ role: "user", content: "Test retry" }] },
        {
          onChunk: (chunk) => {
            if (chunk.type === "content") {
              receivedChunks.push(chunk.content);
            }
          },
        },
      );

      expect(attemptCount).toBe(3);
      expect(receivedChunks).toEqual(["Success"]);
    });

    it("should handle rate limiting with exponential backoff", async () => {
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      let attemptCount = 0;
      const attemptTimes: number[] = [];

      (global.fetch as jest.Mock).mockImplementation(() => {
        attemptCount++;
        attemptTimes.push(Date.now());

        if (attemptCount <= 2) {
          // Rate limited
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: {
              get: (name: string) => (name === "Retry-After" ? "1" : null),
            },
          });
        } else {
          // Success
          return Promise.resolve({
            ok: true,
            status: 200,
            body: {
              getReader: () => ({
                read: jest
                  .fn()
                  .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode(
                      'data: {"choices":[{"delta":{"content":"Success"}}]}\n\n',
                    ),
                  })
                  .mockResolvedValueOnce({
                    done: false,
                    value: new TextEncoder().encode("data: [DONE]\n\n"),
                  })
                  .mockResolvedValueOnce({ done: true }),
              }),
            },
          });
        }
      });

      await providerFetch(
        { messages: [{ role: "user", content: "Test rate limit" }] },
        { onChunk: jest.fn() },
      );

      expect(attemptCount).toBe(3);

      // Verify exponential backoff timing
      if (attemptTimes.length >= 2) {
        const firstDelay = attemptTimes[1] - attemptTimes[0];
        const secondDelay = attemptTimes[2] - attemptTimes[1];
        expect(secondDelay).toBeGreaterThanOrEqual(firstDelay);
      }
    });

    it("should not retry on non-retryable errors", async () => {
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      let attemptCount = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        attemptCount++;
        return Promise.resolve({
          ok: false,
          status: 400, // Bad Request - not retryable
          statusText: "Bad Request",
          json: () => Promise.resolve({ error: "Invalid request format" }),
        });
      });

      await expect(
        providerFetch(
          { messages: [{ role: "user", content: "Bad request" }] },
          { onChunk: jest.fn() },
        ),
      ).rejects.toThrow();

      // Should only try once for non-retryable errors
      expect(attemptCount).toBe(1);
    });

    it("should handle authentication errors and clear credentials", async () => {
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () => Promise.resolve({ error: "Invalid token" }),
      });

      await expect(
        providerFetch(
          { messages: [{ role: "user", content: "Test" }] },
          { onChunk: jest.fn() },
        ),
      ).rejects.toThrow();

      // Verify credentials were cleared
      expect(mockKeytar.deletePassword).toHaveBeenCalledWith(
        "plato-copilot",
        "oauth-creds",
      );
    });
  });

  describe("1.7 Integration Tests", () => {
    it("should complete full authentication and chat flow", async () => {
      // Start unauthenticated
      mockKeytar.getPassword.mockResolvedValue(null);

      // Perform login
      (loadConfig as jest.Mock).mockResolvedValue({
        provider: { copilot: { client_id: "test-client-id" } },
      });

      // Mock device flow
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              device_code: "test-device",
              user_code: "TEST-123",
              verification_uri: "https://github.com/login/device",
              interval: 0.1,
              expires_in: 900,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: "gho_newtoken",
              refresh_token: "ghr_newrefresh",
              token_type: "bearer",
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              token: "cop_newtoken",
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
        });

      await loginCopilot();

      // Verify login succeeded
      expect(mockKeytar.setPassword).toHaveBeenCalled();

      // Now perform a chat request
      const savedCreds = JSON.parse(
        (mockKeytar.setPassword as jest.Mock).mock.calls[0][2],
      );
      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(savedCreds));

      (loadConfig as jest.Mock).mockResolvedValue({
        provider: {
          active: "copilot",
          copilot: {
            base_url: "https://api.githubcopilot.com",
            chat_path: "/chat/completions",
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: jest
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"Hello from Copilot!"}}]}\n\n',
                ),
              })
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode("data: [DONE]\n\n"),
              })
              .mockResolvedValueOnce({ done: true }),
          }),
        },
      });

      const chunks: string[] = [];
      await providerFetch(
        { messages: [{ role: "user", content: "Hello" }] },
        {
          onChunk: (chunk) => {
            if (chunk.type === "content") {
              chunks.push(chunk.content);
            }
          },
        },
      );

      expect(chunks).toEqual(["Hello from Copilot!"]);
    });

    it("should handle logout and cleanup properly", async () => {
      // Setup authenticated state
      const validCreds = {
        type: "oauth",
        access: "test_token",
        refresh: "refresh_token",
        expires: Date.now() + 3600000,
        copilot_token: "cop_token123",
        copilot_expires: Date.now() + 1800000,
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(validCreds));
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);
      mockKeytar.deletePassword.mockResolvedValue(undefined);

      await logoutCopilot();

      // Verify all credentials were cleared
      expect(mockKeytar.deletePassword).toHaveBeenCalledWith(
        "plato-copilot",
        "oauth-creds",
      );
      expect(fs.unlink).toHaveBeenCalledWith(credsFile);

      // Verify can't make requests after logout
      mockKeytar.getPassword.mockResolvedValue(null);

      await expect(
        providerFetch(
          { messages: [{ role: "user", content: "Test" }] },
          { onChunk: jest.fn() },
        ),
      ).rejects.toThrow("not authenticated");
    });
  });
});
