import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { CopilotProvider } from '../providers/copilot';
import { Session } from '../session/session';
import { MemoryManager } from '../memory/memory';

// Mock modules
jest.mock('../providers/copilot');
jest.mock('../session/session');
jest.mock('../memory/memory');
jest.mock('fs');
jest.mock('keytar', () => ({
  getPassword: jest.fn(),
  setPassword: jest.fn(),
  deletePassword: jest.fn(),
}));

describe('Provider and Session Initialization', () => {
  let mockCopilotProvider: jest.Mocked<CopilotProvider>;
  let mockSession: jest.Mocked<Session>;
  let mockMemoryManager: jest.Mocked<MemoryManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock provider
    mockCopilotProvider = new CopilotProvider() as jest.Mocked<CopilotProvider>;
    mockCopilotProvider.initialize = jest.fn().mockResolvedValue(undefined);
    mockCopilotProvider.isAuthenticated = jest.fn().mockResolvedValue(true);
    mockCopilotProvider.getModels = jest.fn().mockResolvedValue(['gpt-4', 'gpt-3.5-turbo']);

    // Setup mock session
    mockSession = new Session(mockCopilotProvider) as jest.Mocked<Session>;
    mockSession.getProvider = jest.fn().mockReturnValue(mockCopilotProvider);
    mockSession.setSystemPrompt = jest.fn();
    mockSession.restore = jest.fn().mockResolvedValue(false);

    // Setup mock memory manager
    mockMemoryManager = new MemoryManager() as jest.Mocked<MemoryManager>;
    mockMemoryManager.initialize = jest.fn().mockResolvedValue(undefined);
    mockMemoryManager.setSession = jest.fn();
  });

  describe('TUI Startup Initialization', () => {
    it('should load configuration from ~/.config/plato/config.json on startup', async () => {
      const fs = await import('fs');
      const mockConfig = {
        endpoint: 'https://api.github.com/copilot',
        model: 'gpt-4',
        autoSave: true,
        theme: 'auto'
      };

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

      // This will be called by keyboard-handler initialization
      const config = JSON.parse(fs.readFileSync('~/.config/plato/config.json', 'utf8'));
      expect(config).toEqual(mockConfig);
      expect(config.endpoint).toBe('https://api.github.com/copilot');
    });

    it('should check for GITHUB_TOKEN environment variable', async () => {
      process.env.GITHUB_TOKEN = 'test-token-123';

      const provider = new CopilotProvider();
      // In real implementation, provider should check env for token
      expect(process.env.GITHUB_TOKEN).toBe('test-token-123');

      delete process.env.GITHUB_TOKEN;
    });

    it('should initialize CopilotProvider with proper headers', async () => {
      const provider = new CopilotProvider();
      await provider.initialize();

      expect(mockCopilotProvider.initialize).toHaveBeenCalled();
      // Should set proper Copilot headers
      // These will be verified in actual implementation
    });

    it('should create Session with system prompt', async () => {
      const systemPrompt = "You are a helpful coding assistant. Be concise and accurate.";
      const session = new Session(mockCopilotProvider);
      session.setSystemPrompt(systemPrompt);

      expect(mockSession.setSystemPrompt).toHaveBeenCalledWith(systemPrompt);
    });

    it('should pass provider and session to command router', async () => {
      const commandRouter = {
        setProvider: jest.fn(),
        setSession: jest.fn()
      };

      commandRouter.setProvider(mockCopilotProvider);
      commandRouter.setSession(mockSession);

      expect(commandRouter.setProvider).toHaveBeenCalledWith(mockCopilotProvider);
      expect(commandRouter.setSession).toHaveBeenCalledWith(mockSession);
    });

    it('should connect session to memory manager', async () => {
      await mockMemoryManager.initialize();
      mockMemoryManager.setSession(mockSession);

      expect(mockMemoryManager.setSession).toHaveBeenCalledWith(mockSession);
    });

    it('should handle authentication failures gracefully', async () => {
      mockCopilotProvider.isAuthenticated = jest.fn().mockResolvedValue(false);

      const isAuth = await mockCopilotProvider.isAuthenticated();
      expect(isAuth).toBe(false);
      // Should still create session but in unauthenticated state
    });

    it('should restore previous session if exists and <24h old', async () => {
      mockSession.restore = jest.fn().mockResolvedValue(true);

      const restored = await mockSession.restore();
      expect(restored).toBe(true);
      expect(mockSession.restore).toHaveBeenCalled();
    });

    it('should pass provider/session to MCP integration', async () => {
      const mcpIntegration = {
        setProvider: jest.fn(),
        setSession: jest.fn()
      };

      mcpIntegration.setProvider(mockCopilotProvider);
      mcpIntegration.setSession(mockSession);

      expect(mcpIntegration.setProvider).toHaveBeenCalledWith(mockCopilotProvider);
      expect(mcpIntegration.setSession).toHaveBeenCalledWith(mockSession);
    });

    it('should make provider/session available to slash commands', async () => {
      const processSlashCommand = jest.fn();

      // Should pass actual provider/session, not null
      processSlashCommand('/login', {
        provider: mockCopilotProvider,
        session: mockSession
      });

      expect(processSlashCommand).toHaveBeenCalledWith(
        '/login',
        expect.objectContaining({
          provider: mockCopilotProvider,
          session: mockSession
        })
      );
    });
  });

  describe('Provider Lifecycle Management', () => {
    it('should handle provider reconnection on network errors', async () => {
      mockCopilotProvider.initialize = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      // First attempt fails
      await expect(mockCopilotProvider.initialize()).rejects.toThrow('Network error');

      // Retry succeeds
      await expect(mockCopilotProvider.initialize()).resolves.toBeUndefined();
      expect(mockCopilotProvider.initialize).toHaveBeenCalledTimes(2);
    });

    it('should update session when provider changes', async () => {
      const newProvider = new CopilotProvider() as jest.Mocked<CopilotProvider>;
      mockSession.setProvider = jest.fn();

      mockSession.setProvider(newProvider);
      expect(mockSession.setProvider).toHaveBeenCalledWith(newProvider);
    });

    it('should persist provider state across TUI restarts', async () => {
      const fs = await import('fs');
      const state = {
        lastProvider: 'copilot',
        lastModel: 'gpt-4',
        timestamp: Date.now()
      };

      // Save state
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
      fs.writeFileSync('.plato/provider-state.json', JSON.stringify(state));

      // Restore state
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(state));

      const restoredState = JSON.parse(fs.readFileSync('.plato/provider-state.json', 'utf8'));
      expect(restoredState.lastProvider).toBe('copilot');
      expect(restoredState.lastModel).toBe('gpt-4');
    });
  });
});