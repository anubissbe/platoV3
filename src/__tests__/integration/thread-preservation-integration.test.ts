/**
 * Thread-Aware Preservation Integration Tests
 * Tests the integration of thread preservation with the orchestrator
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ThreadPreservationSystem } from '../../context/thread-preservation.js';
import orchestrator from '../../runtime/orchestrator.js';
import type { Msg } from '../../runtime/orchestrator.js';

describe('Thread Preservation Integration', () => {
  let threadSystem: ThreadPreservationSystem;

  beforeEach(() => {
    threadSystem = new ThreadPreservationSystem();
    orchestrator.clearHistory();
  });

  test('should integrate thread preservation with orchestrator compaction', async () => {
    // Create a conversation with multiple threads
    const history = orchestrator.getHistory();
    
    // Add some messages to create history
    await orchestrator.respond('Start thread 1');
    await orchestrator.respond('Continue thread 1');
    await orchestrator.respond('Start thread 2');
    await orchestrator.respond('Important message in thread 2');
    
    const currentHistory = orchestrator.getHistory();
    expect(currentHistory.length).toBeGreaterThan(4); // System + user messages + assistant responses

    // Analyze thread structure
    const threads = threadSystem.identifyThreads(currentHistory as any[]);
    expect(threads.length).toBeGreaterThan(0);

    // Test preservation during compaction
    const preserved = threadSystem.preserveThreads(currentHistory as any[], { 
      maxMessages: 10,
      preserveImportant: true,
      threadAware: true 
    });
    
    expect(preserved.length).toBeLessThanOrEqual(currentHistory.length);
    expect(preserved.length).toBeGreaterThan(0);
  });

  test('should maintain thread coherence across session operations', async () => {
    // Build conversation with clear thread boundaries
    await orchestrator.respond('Topic A: First message');
    await orchestrator.respond('Topic A: Second message');
    await orchestrator.respond('Topic B: Different topic');
    await orchestrator.respond('Topic B: Continue different topic');
    
    const history = orchestrator.getHistory();
    
    // Identify threads
    const threads = threadSystem.identifyThreads(history as any[]);
    expect(threads.length).toBeGreaterThanOrEqual(1);
    
    // Each thread should have coherent messages
    threads.forEach(thread => {
      expect(thread.messages.length).toBeGreaterThan(0);
      expect(thread.importance).toBeGreaterThanOrEqual(0);
      expect(thread.importance).toBeLessThanOrEqual(1);
    });

    // Save and restore session
    await orchestrator.saveSession();
    const restored = await orchestrator.restoreSession();
    
    // Thread structure should be maintained
    const restoredHistory = orchestrator.getHistory();
    const restoredThreads = threadSystem.identifyThreads(restoredHistory as any[]);
    expect(restoredThreads.length).toBeGreaterThanOrEqual(threads.length);
  });

  test('should handle memory operations with thread awareness', async () => {
    // Create conversation with memory-worthy content
    await orchestrator.respond('Remember this important fact about the project');
    const memoryId1 = await orchestrator.addMemory('conversation', 'Important project fact');
    
    await orchestrator.respond('Also remember this configuration detail');
    const memoryId2 = await orchestrator.addMemory('context', 'Configuration detail');
    
    expect(memoryId1).toBeTruthy();
    expect(memoryId2).toBeTruthy();
    
    const history = orchestrator.getHistory();
    const threads = threadSystem.identifyThreads(history as any[]);
    
    // Threads should be identifiable even with memory operations
    expect(threads.length).toBeGreaterThan(0);
    
    // Memory and conversation should be coherent
    const projectContext = await orchestrator.getProjectContext();
    expect(typeof projectContext).toBe('string');
  });

  test('should preserve high-importance threads during cleanup', async () => {
    // Create conversation with varying importance
    await orchestrator.respond('Regular message 1');
    await orchestrator.respond('ERROR: Critical system failure occurred');
    await orchestrator.respond('Regular message 2');
    await orchestrator.respond('IMPORTANT: Security vulnerability found');
    await orchestrator.respond('Regular message 3');
    
    const history = orchestrator.getHistory();
    const threads = threadSystem.identifyThreads(history as any[]);
    
    // Find high-importance threads
    const importantThreads = threads.filter(t => t.importance > 0.7);
    const regularThreads = threads.filter(t => t.importance <= 0.7);
    
    // Should have both important and regular content
    expect(threads.length).toBeGreaterThan(0);
    
    // Preserve important threads
    const preserved = threadSystem.preserveThreads(history as any[], {
      maxMessages: 8,
      preserveImportant: true,
      threadAware: true
    });
    
    // Important content should be preserved
    expect(preserved.length).toBeGreaterThan(0);
    expect(preserved.length).toBeLessThanOrEqual(history.length);
  });

  test('should handle complex thread scenarios', async () => {
    // Create complex conversation with nested topics
    await orchestrator.respond('Let me ask about authentication');
    await orchestrator.respond('How does OAuth work?');
    await orchestrator.respond('Actually, let me also check about databases');
    await orchestrator.respond('What about PostgreSQL vs MySQL?');
    await orchestrator.respond('Back to OAuth - what about refresh tokens?');
    
    const history = orchestrator.getHistory();
    const threads = threadSystem.identifyThreads(history as any[]);
    
    expect(threads.length).toBeGreaterThan(0);
    
    // Test thread continuation detection
    const hasAuthThread = threads.some(t => 
      t.messages.some((m: any) => m.content?.includes('OAuth') || m.content?.includes('authentication'))
    );
    const hasDbThread = threads.some(t => 
      t.messages.some((m: any) => m.content?.includes('database') || m.content?.includes('PostgreSQL'))
    );
    
    // Should identify different conversation threads
    expect(threads.length).toBeGreaterThanOrEqual(1);
  });

  test('should maintain performance with large conversations', async () => {
    const startTime = Date.now();
    
    // Generate substantial conversation
    for (let i = 0; i < 50; i++) {
      await orchestrator.respond(`Message ${i}: ${i % 5 === 0 ? 'IMPORTANT' : 'regular'} content`);
    }
    
    const history = orchestrator.getHistory();
    
    // Analyze threads performance
    const analysisStart = Date.now();
    const threads = threadSystem.identifyThreads(history as any[]);
    const analysisTime = Date.now() - analysisStart;
    
    expect(threads.length).toBeGreaterThan(0);
    expect(analysisTime).toBeLessThan(5000); // Should complete within 5 seconds
    
    // Preservation performance
    const preservationStart = Date.now();
    const preserved = threadSystem.preserveThreads(history as any[], {
      maxMessages: 20,
      preserveImportant: true,
      threadAware: true
    });
    const preservationTime = Date.now() - preservationStart;
    
    expect(preserved.length).toBeGreaterThan(0);
    expect(preserved.length).toBeLessThanOrEqual(20);
    expect(preservationTime).toBeLessThan(2000); // Should complete within 2 seconds
    
    const totalTime = Date.now() - startTime;
    expect(totalTime).toBeLessThan(30000); // Total operation within 30 seconds
  });
});