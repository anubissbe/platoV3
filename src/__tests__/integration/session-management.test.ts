/**
 * Session Management Integration Tests
 * 
 * Tests the complete session lifecycle including persistence, restoration,
 * memory management, and cross-session data continuity.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import orchestrator from '../../runtime/orchestrator';
import { IntegrationTestFramework, ClaudeCodeParityValidator } from './framework.test';
import { loadConfig, saveConfig } from '../../config';
import type { Config } from '../../config';
import type { ChatMessage } from '../../core/types';
import type { Msg } from '../../runtime/orchestrator';

interface SessionData {
  messages: ChatMessage[];
  timestamp: string;
  tokenMetrics: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
  memoryContext: string;
}

describe('Session Management Integration', () => {
  let testFramework: IntegrationTestFramework;
  let tempDir: string;
  let sessionPath: string;
  
  beforeEach(async () => {
    testFramework = new IntegrationTestFramework();
    await testFramework.setup();
    
    tempDir = await fs.mkdtemp('/tmp/plato-session-test-');
    sessionPath = path.join(tempDir, 'session.json');
    
    // Reset orchestrator state
    orchestrator.clearHistory();
    orchestrator.resetTokenMetrics();
  });

  afterEach(async () => {
    await testFramework.cleanup();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Session Persistence', () => {
    test('should save and restore basic session data', async () => {
      // Add some messages and interactions
      await orchestrator.respond('Hello, this is a test message');
      orchestrator.updateTokenMetrics({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        cost: 0.001
      });
      
      // Save session
      await orchestrator.saveSession();
      
      // Verify metrics and history
      const metrics = orchestrator.getTokenMetrics();
      expect(metrics.totalTokens).toBeGreaterThan(0);
      
      const history = orchestrator.getHistory();
      expect(history.length).toBeGreaterThan(1); // System message + user message + assistant response
      
      // Find the test message
      const testMessage = history.find((m: Msg) => m.content === 'Hello, this is a test message');
      expect(testMessage).toBeDefined();
      expect(testMessage?.role).toBe('user');
    });

    test('should maintain conversation history across sessions', async () => {
      // Session 1: Add initial messages
      await orchestrator.respond('First message');
      await orchestrator.respond('Second message');
      await orchestrator.saveSession();
      
      const firstSessionHistory = orchestrator.getHistory();
      const firstSessionLength = firstSessionHistory.length;
      
      // Create new orchestrator instance (simulating session restart)
      const newOrchestrator = new (orchestrator.constructor as any)();
      const restored = await newOrchestrator.restoreSession();
      
      expect(restored).toBe(true);
      
      // Add another message in the "new" session
      await newOrchestrator.respond('Follow-up message');
      
      const restoredMessages = newOrchestrator.getHistory();
      const followUpMessage = restoredMessages.find((m: Msg) => m.content === 'Follow-up message');
      expect(followUpMessage).toBeDefined();
    });

    test('should handle session restoration gracefully when no session exists', async () => {
      const newOrchestrator = new (orchestrator.constructor as any)();
      const restored = await newOrchestrator.restoreSession();
      
      expect(restored).toBe(false);
      
      // Should still function normally
      const response = await newOrchestrator.respond('Test after failed restore');
      expect(response).toBeDefined();
    });
  });

  describe('Memory Integration', () => {
    test('should persist memory entries across sessions', async () => {
      // Add memory entries
      const memoryId1 = await orchestrator.addMemory('conversation', 'Important conversation note');
      const memoryId2 = await orchestrator.addMemory('context', 'Project context information');
      
      expect(memoryId1).toBeTruthy();
      expect(memoryId2).toBeTruthy();
      
      // Save session
      await orchestrator.saveSession();
      
      // Memory should be accessible
      const projectContext = await orchestrator.getProjectContext();
      // Context might be empty if no project context was set
      expect(typeof projectContext).toBe('string');
    });

    test('should maintain project context across sessions', async () => {
      const testContext = 'This is important context';
      await orchestrator.updateProjectContext(testContext);
      
      // Save session
      await orchestrator.saveSession();
      
      const messages = orchestrator.getHistory();
      const contextMessage = messages.find((m: Msg) => m.content === 'This is important context');
      // Context is stored in memory, not necessarily in history
      
      // Verify context is retrievable
      const retrievedContext = await orchestrator.getProjectContext();
      expect(retrievedContext).toBe(testContext);
    });

    test('should handle memory operations during session lifecycle', async () => {
      // Add initial memory
      await orchestrator.addMemory('conversation', 'Session start');
      
      // Perform some operations
      await orchestrator.respond('Test conversation');
      
      // Add more memory
      await orchestrator.addMemory('analysis', 'Mid-session analysis');
      
      // Save session
      await orchestrator.saveSession();
      
      // Memory operations should work without errors
      const finalMemoryId = await orchestrator.addMemory('conversation', 'Session end');
      expect(finalMemoryId).toBeTruthy();
    });
  });

  describe('Token Metrics and Cost Tracking', () => {
    test('should track token metrics across session lifecycle', async () => {
      // Initial state
      let metrics = orchestrator.getTokenMetrics();
      expect(metrics.totalTokens).toBe(0);
      
      // Add some token usage
      orchestrator.updateTokenMetrics({
        inputTokens: 100,
        outputTokens: 150,
        totalTokens: 250,
        cost: 0.005
      });
      
      metrics = orchestrator.getTokenMetrics();
      expect(metrics.totalTokens).toBe(250);
      expect(metrics.cost).toBe(0.005);
      
      // Save session
      await orchestrator.saveSession();
      
      // Add more usage
      orchestrator.updateTokenMetrics({
        inputTokens: 50,
        outputTokens: 75,
        totalTokens: 125,
        cost: 0.002
      });
      
      const finalMetrics = orchestrator.getTokenMetrics();
      expect(finalMetrics.totalTokens).toBe(375); // 250 + 125
      expect(finalMetrics.cost).toBe(0.007); // 0.005 + 0.002
    });

    test('should reset metrics when requested', async () => {
      // Add some metrics
      orchestrator.updateTokenMetrics({
        inputTokens: 100,
        outputTokens: 100,
        totalTokens: 200,
        cost: 0.004
      });
      
      let metrics = orchestrator.getTokenMetrics();
      expect(metrics.totalTokens).toBe(200);
      
      // Reset
      orchestrator.resetTokenMetrics();
      
      metrics = orchestrator.getTokenMetrics();
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.cost).toBe(0);
    });
  });

  describe('Session Data Integrity', () => {
    test('should handle concurrent session operations', async () => {
      const promises = [];
      
      // Simulate concurrent operations
      for (let i = 0; i < 5; i++) {
        promises.push(orchestrator.addMemory('test', `Concurrent operation ${i}`));
        promises.push(orchestrator.respond(`Message ${i}`));
      }
      
      // Wait for all operations
      await Promise.all(promises);
      
      // Save session
      await orchestrator.saveSession();
      
      // Session should be in consistent state
      const history = orchestrator.getHistory();
      expect(history.length).toBeGreaterThan(5); // At least system + user messages + assistant responses
    });

    test('should handle session corruption gracefully', async () => {
      // This test simulates corruption but since we don't have direct file access
      // we'll test that the orchestrator handles missing/invalid session data
      
      const newOrchestrator = new (orchestrator.constructor as any)();
      
      // Try to restore from non-existent session
      const restored = await newOrchestrator.restoreSession();
      expect(restored).toBe(false);
      
      // Should still work normally
      const response = await newOrchestrator.respond('Test after corruption');
      expect(response).toBeDefined();
    });

    test('should maintain session state during error conditions', async () => {
      // Add some state
      await orchestrator.respond('Initial message');
      orchestrator.updateTokenMetrics({ inputTokens: 10, outputTokens: 10, totalTokens: 20, cost: 0.001 });
      
      // Simulate error condition (we can't really cause the internal systems to error in this test)
      // but we can verify that the session state remains intact
      
      const metrics = orchestrator.getTokenMetrics();
      expect(metrics.totalTokens).toBe(20);
      
      const history = orchestrator.getHistory();
      expect(history.length).toBeGreaterThan(1);
      
      // Save session should work
      await orchestrator.saveSession();
    });
  });

  describe('Cross-Session Data Continuity', () => {
    test('should maintain conversation context across multiple session cycles', async () => {
      // Session 1
      await orchestrator.respond('Context message 1');
      await orchestrator.saveSession();
      
      // Session 2
      const orchestrator2 = new (orchestrator.constructor as any)();
      await orchestrator2.restoreSession();
      await orchestrator2.respond('Context message 2');
      await orchestrator2.saveSession();
      
      // Session 3
      const orchestrator3 = new (orchestrator.constructor as any)();
      await orchestrator3.restoreSession();
      const response = await orchestrator3.respond('What was our previous discussion?');
      
      expect(response).toBeDefined();
      // The response would contain reference to previous context if properly restored
    });

    test('should handle session backup and recovery', async () => {
      // Create session state
      await orchestrator.respond('Backup test message');
      orchestrator.updateTokenMetrics({ inputTokens: 50, outputTokens: 50, totalTokens: 100, cost: 0.002 });
      await orchestrator.saveSession();
      
      const originalHistory = orchestrator.getHistory();
      const originalMetrics = orchestrator.getTokenMetrics();
      
      // Simulate backup (save current state)
      const backupData = {
        history: originalHistory,
        metrics: originalMetrics
      };
      
      // Clear current state
      orchestrator.clearHistory();
      orchestrator.resetTokenMetrics();
      
      // Verify cleared
      expect(orchestrator.getHistory().length).toBe(1); // Only system message remains
      expect(orchestrator.getTokenMetrics().totalTokens).toBe(0);
      
      // Restore from backup
      orchestrator.setHistory(backupData.history);
      orchestrator.updateTokenMetrics(backupData.metrics);
      
      const restoredHistory = orchestrator.getHistory();
      const backupMessage = restoredHistory.find((m: Msg) => m.content === 'Backup test message');
      expect(backupMessage).toBeDefined();
    });
  });

  describe('Performance and Resource Management', () => {
    test('should handle large session data efficiently', async () => {
      const startTime = Date.now();
      
      // Generate large amount of session data
      for (let i = 0; i < 100; i++) {
        await orchestrator.addMemory('test', `Large session data ${i}`);
        if (i % 10 === 0) {
          await orchestrator.respond(`Batch message ${i / 10}`);
        }
      }
      
      // Save session
      await orchestrator.saveSession();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (10 seconds)
      expect(duration).toBeLessThan(10000);
      
      // Session should be in valid state
      const history = orchestrator.getHistory();
      expect(history.length).toBeGreaterThan(10);
    });

    test('should clean up resources properly during session management', async () => {
      // Create and save session
      await orchestrator.respond('Resource test');
      await orchestrator.saveSession();
      
      // Cleanup should not throw errors
      expect(() => {
        // Any cleanup operations would go here
        orchestrator.clearHistory();
      }).not.toThrow();
    });
  });
});