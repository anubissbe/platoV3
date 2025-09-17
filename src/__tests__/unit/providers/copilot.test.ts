// Mock os.homedir BEFORE any imports
const mockHomedir = jest.fn(() => "/home/test");

jest.mock("os", () => ({
  ...jest.requireActual("os"),
  homedir: mockHomedir,
}));

jest.mock("../../../config");
jest.mock("fs/promises");
jest.mock("keytar", () => ({
  getPassword: jest.fn(),
  setPassword: jest.fn(),
  deletePassword: jest.fn(),
}));

// Mock fetch globally
global.fetch = jest.fn();

// Now import modules
import fs from "fs/promises";
import path from "path";
import {
  loginCopilot,
  logoutCopilot,
  providerFetch,
} from "../../../providers/copilot";
import { loadConfig } from "../../../config";

describe("copilot provider", () => {
  const mockHomeDir = "/home/test";
  const credsFile = path.join(
    mockHomeDir,
    ".config",
    "plato",
    "credentials.json",
  );
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockKeytar = require("keytar");

  beforeEach(() => {
    jest.clearAllMocks();

    // Ensure homedir returns mock value
    mockHomedir.mockReturnValue(mockHomeDir);

    // Mock process.stdout.write
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);

    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();

    // Reset all mocks
    mockKeytar.getPassword.mockReset();
    mockKeytar.setPassword.mockReset();
    mockKeytar.deletePassword.mockReset();
    mockFs.readFile?.mockReset?.();
    mockFs.writeFile?.mockReset?.();
    mockFs.mkdir?.mockReset?.();
    mockFs.unlink?.mockReset?.();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("loginCopilot", () => {
    it("should perform OAuth device flow authentication", async () => {
      // Mock no existing credentials
      mockKeytar.getPassword.mockResolvedValue(null);
      mockFs.readFile?.mockRejectedValue?.({ code: "ENOENT" });

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
              user_code: "TEST-CODE",
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
            }),
        }),
      );

      // Mock credential storage
      mockFs.mkdir?.mockResolvedValue?.(undefined);
      mockFs.writeFile?.mockResolvedValue?.(undefined);

      // Mock subsequent keytar call for ensureAccessToken()
      const savedCreds = {
        type: "oauth",
        refresh: "gho_testtoken123",
        access: "",
        expires: 0,
      };
      mockKeytar.setPassword.mockResolvedValue(undefined);
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

      // Verify user code was displayed
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining("TEST-CODE"),
      );
    });
  });

  describe("logoutCopilot", () => {
    it("should delete credentials and print logout message", async () => {
      // Mock keytar delete
      mockKeytar.deletePassword.mockResolvedValue(true);
      mockFs.unlink?.mockResolvedValue?.(undefined);

      await logoutCopilot();

      expect(process.stdout.write).toHaveBeenCalledWith("Logged out.\n");
    });
  });

  describe("providerFetch", () => {
    it("should refresh expired access token", async () => {
      // Mock credentials with expired access token
      const expiredCreds = {
        type: "oauth",
        refresh: "test-refresh-token",
        access: "old-token",
        expires: Date.now() - 1000, // Expired
      };

      mockKeytar.getPassword.mockResolvedValue(JSON.stringify(expiredCreds));

      // Mock token refresh
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              token: "new-access-token",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
        }),
      );

      // Mock the actual request
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ test: "response" }),
        }),
      );

      mockKeytar.setPassword.mockResolvedValue(undefined);
      mockFs.writeFile?.mockResolvedValue?.(undefined);

      (loadConfig as jest.Mock).mockResolvedValue({
        provider: { copilot: {} },
      });

      const response = await providerFetch(
        "https://api.githubcopilot.com/chat/completions",
        {
          method: "POST",
          body: JSON.stringify({ test: "data" }),
        },
      );

      expect(response.ok).toBe(true);
    });
  });
});
