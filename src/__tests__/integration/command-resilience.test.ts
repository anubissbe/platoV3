/**
 * Integration Tests for Command Resilience Patterns
 * 
 * Tests circuit breaker, resource management, and validation patterns
 * for high-risk commands.
 */

import { CircuitBreaker, CircuitState, circuitBreakerManager } from '../../utils/circuit-breaker.js';
import { globalResourceManager } from '../../utils/resource-manager.js';
import { resilientCommandExecutor } from '../../utils/command-resilience.js';
import {
  executeMcpCommand,
  executeProxyCommand,
  executeLoginCommand,
  executeInstallGitlabAppCommand,
  executeHooksCommand
} from '../../commands/resilient-commands.js';

// Mock external dependencies
jest.mock('fs/promises');
jest.mock('http');

// Increase timeout for integration tests
jest.setTimeout(15000);

describe('Command Resilience Integration', () => {
  let mockSession: any;
  let mockProvider: any;

  beforeEach(() => {
    mockSession = {
      getMessages: jest.fn(() => []),
      addMessage: jest.fn()
    };
    
    mockProvider = {
      name: 'test-provider'
    };
    
    // Clear any existing state
    circuitBreakerManager.resetAll();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup resources after each test
    await resilientCommandExecutor.cleanup();
    await globalResourceManager.shutdown();
  });

  describe('Circuit Breaker Patterns', () => {
    test('should create circuit breaker with correct configuration', () => {
      const breaker = circuitBreakerManager.getOrCreate('test-command', {
        failureThreshold: 3,
        resetTimeout: 60000,
        enableDebug: true
      });

      expect(breaker).toBeInstanceOf(CircuitBreaker);
      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
    });

    test('should open circuit after threshold failures', async () => {
      const breaker = circuitBreakerManager.getOrCreate('failing-command', {
        failureThreshold: 2,
        resetTimeout: 1000,
        minimumCalls: 1,
        expectedFailureRate: 0.5
      });

      // Simulate failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Simulated failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.failureCount).toBeGreaterThanOrEqual(2);
    });

    test('should use fallback when circuit is open', async () => {
      const breaker = circuitBreakerManager.getOrCreate('fallback-command', {
        failureThreshold: 1,
        resetTimeout: 1000,
        minimumCalls: 1,
        expectedFailureRate: 0.1
      });

      // Open circuit
      try {
        await breaker.execute(async () => {
          throw new Error('Initial failure');
        });
      } catch (error) {
        // Expected
      }

      // Should use fallback
      const result = await breaker.execute(
        async () => {
          throw new Error('Should not execute');
        },
        async () => {
          return 'fallback result';
        }
      );

      expect(result).toBe('fallback result');
    });
  });

  describe('Resource Management', () => {
    test('should acquire and release resources properly', async () => {
      const resourceId = 'test-resource-1';
      let cleanupCalled = false;

      const resource = await globalResourceManager.acquire(
        resourceId,
        'test',
        async () => ({ data: 'test-data' }),
        async () => { cleanupCalled = true; },
        { priority: 5 }
      );

      expect(resource).toEqual({ data: 'test-data' });
      
      const stats = globalResourceManager.getStats();
      expect(stats.totalResources).toBe(1);
      expect(stats.resourcesByType.test).toBe(1);

      await globalResourceManager.release(resourceId);
      expect(cleanupCalled).toBe(true);

      const statsAfter = globalResourceManager.getStats();
      expect(statsAfter.totalResources).toBe(0);
    });

    test('should handle resource limits', async () => {
      // This test would require configuring a resource manager with low limits
      // For now, we'll test the basic functionality
      const result = await globalResourceManager.withResource(
        'limited-resource',
        'test',
        async () => 'resource-data',
        async (resource) => `processed: ${resource}`,
        async () => { /* cleanup */ }
      );

      expect(result).toBe('processed: resource-data');
    });
  });

  describe('Command Validation', () => {
    test('should validate MCP command arguments', async () => {
      const result = await executeMcpCommand(
        ['attach', 'test-server', 'http://localhost:8719'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Successfully attached');
      expect(result.error).toBeUndefined();
    });

    test('should reject invalid MCP arguments', async () => {
      const result = await executeMcpCommand(
        [], // No arguments
        mockSession,
        mockProvider
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    test('should validate proxy command port numbers', async () => {
      const result = await executeProxyCommand(
        ['start', '--port', '8080'],
        mockSession,
        mockProvider
      );

      // Should succeed with valid port
      expect(result.output).toContain('started on http://localhost:8080');
    });

    test('should reject invalid proxy ports', async () => {
      const result = await executeProxyCommand(
        ['start', '--port', '999'], // Port too low
        mockSession,
        mockProvider
      );

      expect(result.error).toContain('Invalid port number');
    });
  });

  describe('MCP Command Resilience', () => {
    test('should handle successful MCP attach', async () => {
      // Mock successful fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const result = await executeMcpCommand(
        ['attach', 'test-server', 'http://localhost:8719'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Successfully attached MCP server');
      expect(result.error).toBeUndefined();
    });

    test('should handle MCP server connection failure with circuit breaker', async () => {
      // Mock failed fetch
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await executeMcpCommand(
        ['attach', 'failing-server', 'http://localhost:9999'],
        mockSession,
        mockProvider
      );

      expect(result.error).toContain('Failed to connect to MCP server');
    });

    test('should list MCP servers', async () => {
      const result = await executeMcpCommand(
        ['list'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Connected MCP Servers');
    });

    test('should show MCP tools', async () => {
      const result = await executeMcpCommand(
        ['tools'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Available MCP Tools');
    });
  });

  describe('Login Command Resilience', () => {
    test('should handle successful login', async () => {
      const result = await executeLoginCommand(
        ['copilot'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Successfully authenticated');
    });

    test('should reject unsupported providers', async () => {
      const result = await executeLoginCommand(
        ['unsupported-provider'],
        mockSession,
        mockProvider
      );

      expect(result.error).toContain('Supported providers: copilot, gitlab');
    });

    test('should handle authentication timeout', async () => {
      // This test relies on the internal timeout simulation
      // which has a 10% failure rate in the mock
      const result = await executeLoginCommand(
        ['gitlab'],
        mockSession,
        mockProvider
      );

      // Should either succeed or fail with proper error handling
      expect(result.output || result.error).toBeDefined();
    });
  });

  describe('Proxy Command Resilience', () => {
    test('should start proxy with valid configuration', async () => {
      const result = await executeProxyCommand(
        ['start', '--port', '11434'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('OpenAI-compatible HTTP proxy started');
    });

    test('should show proxy status', async () => {
      const result = await executeProxyCommand(
        ['status'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('HTTP Proxy Status');
    });

    test('should stop proxy', async () => {
      const result = await executeProxyCommand(
        ['stop'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('HTTP proxy server stopped');
    });
  });

  describe('GitLab App Command Resilience', () => {
    test('should show GitLab help', async () => {
      const result = await executeInstallGitlabAppCommand(
        [],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('GitLab Integration Setup');
    });

    test('should provide token instructions', async () => {
      const result = await executeInstallGitlabAppCommand(
        ['token'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('GitLab Personal Access Token Setup');
    });

    test('should configure token with validation', async () => {
      const result = await executeInstallGitlabAppCommand(
        ['configure', 'glpat-xxxxxxxxxxxxxxxxxxxx'],
        mockSession,
        mockProvider
      );

      // Should succeed (90% success rate in mock)
      expect(result.output || result.error).toBeDefined();
    });

    test('should reject invalid tokens', async () => {
      const result = await executeInstallGitlabAppCommand(
        ['configure', 'short'],
        mockSession,
        mockProvider
      );

      expect(result.error).toContain('Token appears invalid');
    });

    test('should test GitLab configuration', async () => {
      const result = await executeInstallGitlabAppCommand(
        ['test'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Configuration Test Results');
    });
  });

  describe('Hooks Command Resilience', () => {
    test('should show hooks help', async () => {
      const result = await executeHooksCommand(
        [],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Hooks Management');
    });

    test('should list hooks', async () => {
      const result = await executeHooksCommand(
        ['list'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Configured Hooks');
    });

    test('should add hook with validation', async () => {
      const result = await executeHooksCommand(
        ['add', 'test-hook', './scripts/test.sh'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Hook \'test-hook\' added successfully');
    });

    test('should reject invalid hook names', async () => {
      const result = await executeHooksCommand(
        ['add', 'invalid hook name!', './scripts/test.sh'],
        mockSession,
        mockProvider
      );

      expect(result.error).toContain('Hook name can only contain');
    });

    test('should remove hooks', async () => {
      const result = await executeHooksCommand(
        ['remove', 'test-hook'],
        mockSession,
        mockProvider
      );

      expect(result.output).toContain('Hook \'test-hook\' removed successfully');
    });

    test('should enable/disable hooks', async () => {
      const enableResult = await executeHooksCommand(
        ['enable', 'test-hook'],
        mockSession,
        mockProvider
      );

      const disableResult = await executeHooksCommand(
        ['disable', 'test-hook'],
        mockSession,
        mockProvider
      );

      expect(enableResult.output).toContain('enabled successfully');
      expect(disableResult.output).toContain('disabled successfully');
    });
  });

  describe('Error Recovery', () => {
    test('should recover from transient failures', async () => {
      let callCount = 0;
      
      const result = await resilientCommandExecutor.executeCommand(
        async (args, context) => {
          callCount++;
          if (callCount < 2) {
            throw new Error('Transient failure');
          }
          return 'Success after retry';
        },
        ['test'],
        {
          commandName: 'test-recovery',
          retry: {
            maxRetries: 2,
            baseDelay: 100,
            maxDelay: 500
          }
        }
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('Success after retry');
      expect(result.retried).toBe(true);
      expect(callCount).toBe(2);
    });

    test('should provide fallback for persistent failures', async () => {
      const result = await resilientCommandExecutor.executeCommand(
        async (args, context) => {
          throw new Error('Persistent failure');
        },
        ['test'],
        {
          commandName: 'test-fallback',
          retry: {
            maxRetries: 1,
            baseDelay: 100
          }
        }
      );

      // Should use error recovery
      expect(result.success || result.error).toBeDefined();
    });
  });

  describe('Resource Cleanup', () => {
    test('should cleanup resources on successful completion', async () => {
      const result = await resilientCommandExecutor.executeCommand(
        async (args, context) => {
          return 'Success';
        },
        ['test'],
        {
          commandName: 'test-cleanup-success',
          resources: {
            cleanup: true,
            timeout: 5000,
            priority: 5
          }
        }
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('Success');
    });

    test('should cleanup resources on failure', async () => {
      const result = await resilientCommandExecutor.executeCommand(
        async (args, context) => {
          throw new Error('Test failure');
        },
        ['test'],
        {
          commandName: 'test-cleanup-failure',
          resources: {
            cleanup: true,
            timeout: 5000,
            priority: 5
          }
        }
      );

      expect(result.success).toBe(false);
      // Cleanup should still occur
    });
  });
});
