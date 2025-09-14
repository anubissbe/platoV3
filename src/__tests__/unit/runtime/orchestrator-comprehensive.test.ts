/**
 * Comprehensive Runtime Orchestrator Testing
 * Testing history management, session persistence, memory, patches, metrics
 */

import { Orchestrator } from '../../../runtime/orchestrator';
import { MemoryManager } from '../../../memory/manager';
import { loadConfig, saveConfig } from '../../../config';
import fs from 'fs/promises';
import path from 'path';

jest.mock('../../../config');
jest.mock('fs/promises');
jest.mock('../../../memory/manager');

describe('Task 4: Runtime Orchestrator Testing', () => {
  let orchestrator: Orchestrator;
  let mockMemoryManager: jest.Mocked<MemoryManager>;

  beforeEach(() => {
    orchestrator = new Orchestrator();
    mockMemoryManager = new MemoryManager() as jest.Mocked<MemoryManager>;
    jest.clearAllMocks();
  });

  describe('✅ 4.1 Conversation History Management', () => {
    test('should add messages to history', () => {
      orchestrator.addToHistory('user', 'Hello');
      orchestrator.addToHistory('assistant', 'Hi there!');
      
      const history = orchestrator.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Hello');
      expect(history[1].role).toBe('assistant');
      expect(history[1].content).toBe('Hi there!');
    });

    test('should maintain history order', () => {
      for (let i = 0; i < 10; i++) {
        orchestrator.addToHistory(
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i}`
        );
      }
      
      const history = orchestrator.getHistory();
      expect(history).toHaveLength(10);
      expect(history[0].content).toBe('Message 0');
      expect(history[9].content).toBe('Message 9');
    });

    test('should handle history limits', () => {
      const maxHistory = 100;
      
      // Add more than max messages
      for (let i = 0; i < 150; i++) {
        orchestrator.addToHistory('user', `Message ${i}`);
      }
      
      const history = orchestrator.getHistory();
      expect(history.length).toBeLessThanOrEqual(maxHistory);
    });

    test('should clear history on reset', () => {
      orchestrator.addToHistory('user', 'Test');
      orchestrator.addToHistory('assistant', 'Response');
      
      expect(orchestrator.getHistory()).toHaveLength(2);
      
      orchestrator.reset();
      
      expect(orchestrator.getHistory()).toHaveLength(0);
    });
  });

  describe('✅ 4.2 Session Save/Restore', () => {
    test('should save session to file', async () => {
      orchestrator.addToHistory('user', 'Test message');
      orchestrator.addToHistory('assistant', 'Test response');
      
      const mockWriteFile = fs.writeFile as jest.Mock;
      mockWriteFile.mockResolvedValue(undefined);
      
      await orchestrator.saveSession();
      
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('session.json'),
        expect.stringContaining('Test message'),
        'utf8'
      );
    });

    test('should restore session from file', async () => {
      const sessionData = {
        history: [
          { role: 'user', content: 'Restored message' },
          { role: 'assistant', content: 'Restored response' }
        ],
        metadata: {
          timestamp: Date.now(),
          version: '1.0.0'
        }
      };
      
      const mockReadFile = fs.readFile as jest.Mock;
      mockReadFile.mockResolvedValue(JSON.stringify(sessionData));
      
      await orchestrator.restoreSession();
      
      const history = orchestrator.getHistory();
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('Restored message');
    });

    test('should handle missing session file gracefully', async () => {
      const mockReadFile = fs.readFile as jest.Mock;
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      
      await expect(orchestrator.restoreSession()).resolves.not.toThrow();
      
      // Should have empty history
      expect(orchestrator.getHistory()).toHaveLength(0);
    });

    test('should auto-save session periodically', async () => {
      jest.useFakeTimers();
      
      const mockWriteFile = fs.writeFile as jest.Mock;
      mockWriteFile.mockResolvedValue(undefined);
      
      orchestrator.enableAutoSave(5000); // 5 second interval
      orchestrator.addToHistory('user', 'Auto-save test');
      
      // Fast-forward time
      jest.advanceTimersByTime(5000);
      
      expect(mockWriteFile).toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('✅ 4.3 Memory Persistence and Compaction', () => {
    test('should persist memory to disk', async () => {
      mockMemoryManager.save.mockResolvedValue(undefined);
      
      orchestrator.setMemoryManager(mockMemoryManager);
      await orchestrator.saveMemory();
      
      expect(mockMemoryManager.save).toHaveBeenCalled();
    });

    test('should compact conversation history', async () => {
      // Add many messages
      for (let i = 0; i < 100; i++) {
        orchestrator.addToHistory(
          i % 2 === 0 ? 'user' : 'assistant',
          `Message ${i} with some content that makes it longer`
        );
      }
      
      const originalLength = orchestrator.getHistory().length;
      
      await orchestrator.compactHistory();
      
      const compactedLength = orchestrator.getHistory().length;
      expect(compactedLength).toBeLessThan(originalLength);
    });

    test('should preserve important messages during compaction', async () => {
      orchestrator.addToHistory('user', 'Important: API key is XYZ');
      orchestrator.addToHistory('assistant', 'Noted the API key');
      orchestrator.addToHistory('user', 'What is the weather?');
      orchestrator.addToHistory('assistant', 'The weather is sunny');
      
      // Mark first messages as important
      orchestrator.markImportant(0);
      orchestrator.markImportant(1);
      
      await orchestrator.compactHistory({ preserveImportant: true });
      
      const history = orchestrator.getHistory();
      expect(history.some(m => m.content.includes('API key'))).toBe(true);
    });

    test('should handle memory limits', async () => {
      const maxMemoryMB = 10;
      orchestrator.setMemoryLimit(maxMemoryMB);
      
      // Try to add excessive data
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB string
      
      for (let i = 0; i < 20; i++) {
        orchestrator.addToHistory('user', largeContent);
      }
      
      // Should trigger auto-compaction
      const memoryUsage = orchestrator.getMemoryUsage();
      expect(memoryUsage).toBeLessThan(maxMemoryMB * 1024 * 1024);
    });
  });

  describe('✅ 4.4 Patch Extraction and Application', () => {
    test('should extract patches from messages', () => {
      const messageWithPatch = `
        Here's the fix for your code:
        *** Begin Patch
        --- a/file.js
        +++ b/file.js
        @@ -1,3 +1,3 @@
        -const old = true;
        +const new = false;
        *** End Patch
      `;
      
      const patches = orchestrator.extractPatches(messageWithPatch);
      
      expect(patches).toHaveLength(1);
      expect(patches[0]).toContain('const new = false');
    });

    test('should apply patches to files', async () => {
      const patch = `
        --- a/test.js
        +++ b/test.js
        @@ -1,1 +1,1 @@
        -old content
        +new content
      `;
      
      const mockExec = jest.fn().mockResolvedValue({ stdout: 'Applied' });
      orchestrator.setExecutor(mockExec);
      
      const result = await orchestrator.applyPatch(patch);
      
      expect(result.success).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('git apply')
      );
    });

    test('should handle patch failures', async () => {
      const invalidPatch = 'not a valid patch';
      
      const mockExec = jest.fn().mockRejectedValue(new Error('Patch failed'));
      orchestrator.setExecutor(mockExec);
      
      const result = await orchestrator.applyPatch(invalidPatch);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('failed');
    });

    test('should maintain patch journal', async () => {
      const mockWriteFile = fs.writeFile as jest.Mock;
      mockWriteFile.mockResolvedValue(undefined);
      
      await orchestrator.recordPatch({
        patch: 'test patch',
        timestamp: Date.now(),
        success: true,
        files: ['test.js']
      });
      
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('patch-journal.json'),
        expect.any(String),
        'utf8'
      );
    });
  });

  describe('✅ 4.5 Metrics Tracking', () => {
    test('should track token usage', () => {
      orchestrator.updateTokens(100, 50);
      orchestrator.updateTokens(200, 75);
      
      const metrics = orchestrator.getMetrics();
      
      expect(metrics.inputTokens).toBe(300);
      expect(metrics.outputTokens).toBe(125);
      expect(metrics.input).toBe(300);
      expect(metrics.output).toBe(125);
    });

    test('should calculate turns correctly', () => {
      orchestrator.addToHistory('user', 'Question 1');
      orchestrator.addToHistory('assistant', 'Answer 1');
      orchestrator.addToHistory('user', 'Question 2');
      orchestrator.addToHistory('assistant', 'Answer 2');
      
      const metrics = orchestrator.getMetrics();
      
      expect(metrics.turns).toBe(2);
    });

    test('should track response times', async () => {
      const startTime = Date.now();
      
      await orchestrator.processMessage('Test message');
      
      const metrics = orchestrator.getMetrics();
      
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.durationMs).toBeLessThan(1000);
    });

    test('should export metrics data', () => {
      orchestrator.updateTokens(500, 250);
      orchestrator.addToHistory('user', 'Test');
      orchestrator.addToHistory('assistant', 'Response');
      
      const exported = orchestrator.exportMetrics();
      
      expect(exported).toHaveProperty('tokens');
      expect(exported).toHaveProperty('turns');
      expect(exported).toHaveProperty('timestamp');
      expect(exported.tokens.input).toBe(500);
      expect(exported.tokens.output).toBe(250);
      expect(exported.turns).toBe(1);
    });
  });

  describe('✅ 4.6 Background Mode Operations', () => {
    test('should enable background mode', () => {
      orchestrator.setBackgroundMode(true);
      
      expect(orchestrator.isBackgroundMode()).toBe(true);
    });

    test('should queue operations in background mode', async () => {
      orchestrator.setBackgroundMode(true);
      
      const operations = [
        orchestrator.processMessage('Message 1'),
        orchestrator.processMessage('Message 2'),
        orchestrator.processMessage('Message 3')
      ];
      
      // All should be queued
      await Promise.all(operations);
      
      expect(orchestrator.getQueueLength()).toBe(0); // All processed
    });

    test('should process background queue', async () => {
      orchestrator.setBackgroundMode(true);
      
      orchestrator.queueOperation(() => Promise.resolve('Op 1'));
      orchestrator.queueOperation(() => Promise.resolve('Op 2'));
      
      const results = await orchestrator.processQueue();
      
      expect(results).toHaveLength(2);
      expect(results[0]).toBe('Op 1');
      expect(results[1]).toBe('Op 2');
    });
  });

  describe('✅ 4.7 Transcript Mode', () => {
    test('should enable transcript mode', () => {
      orchestrator.setTranscriptMode(true);
      
      expect(orchestrator.isTranscriptMode()).toBe(true);
    });

    test('should save transcript to file', async () => {
      const mockWriteFile = fs.writeFile as jest.Mock;
      mockWriteFile.mockResolvedValue(undefined);
      
      orchestrator.setTranscriptMode(true);
      orchestrator.addToHistory('user', 'Transcript test');
      orchestrator.addToHistory('assistant', 'Transcript response');
      
      await orchestrator.saveTranscript();
      
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('transcript'),
        expect.stringContaining('Transcript test'),
        'utf8'
      );
    });

    test('should format transcript with timestamps', async () => {
      orchestrator.setTranscriptMode(true);
      
      const now = Date.now();
      orchestrator.addToHistory('user', 'Test', { timestamp: now });
      
      const transcript = orchestrator.formatTranscript();
      
      expect(transcript).toContain(new Date(now).toISOString());
      expect(transcript).toContain('Test');
    });
  });

  describe('✅ 4.8 Integration Verification', () => {
    test('should handle complete orchestration workflow', async () => {
      // 1. Initialize
      orchestrator.initialize();
      
      // 2. Add messages
      orchestrator.addToHistory('user', 'Hello');
      orchestrator.addToHistory('assistant', 'Hi!');
      
      // 3. Update metrics
      orchestrator.updateTokens(10, 5);
      
      // 4. Save session
      const mockWriteFile = fs.writeFile as jest.Mock;
      mockWriteFile.mockResolvedValue(undefined);
      await orchestrator.saveSession();
      
      // 5. Get stats
      const stats = orchestrator.getStats();
      
      expect(stats).toHaveProperty('messages', 2);
      expect(stats).toHaveProperty('tokens');
      expect(stats.tokens.total).toBe(15);
    });

    test('should recover from errors gracefully', async () => {
      const mockReadFile = fs.readFile as jest.Mock;
      mockReadFile.mockRejectedValue(new Error('Read error'));
      
      // Should not throw
      await expect(orchestrator.restoreSession()).resolves.not.toThrow();
      
      // Should continue working
      orchestrator.addToHistory('user', 'Still works');
      expect(orchestrator.getHistory()).toHaveLength(1);
    });
  });
});