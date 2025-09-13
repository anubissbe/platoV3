/**
 * Headless execution mode for Plato CLI
 * Allows batch processing and programmatic access
 */

import orchestrator from './orchestrator.js';
import { OrchestratorEvent } from './orchestrator.js';

export interface HeadlessOptions {
  outputFormat?: 'json' | 'plain' | 'stream-json';
  skipPermissions?: boolean;
  sessionId?: string;
  timeout?: number;
  model?: string;
}

/**
 * Execute a query in headless mode
 */
export async function headlessExecute(
  question: string,
  options: HeadlessOptions = {}
): Promise<string> {
  const headlessOptions: Required<HeadlessOptions> = {
    outputFormat: 'plain',
    skipPermissions: false,
    sessionId: `headless-${Date.now()}`,
    timeout: 30000,
    model: 'gpt-4o',
    ...options
  };

  // Initialize analytics system
  await orchestrator.initializeAnalyticsSystem(true);
  
  if (headlessOptions.skipPermissions) {
    // Note: setPermissionsEnabled method doesn't exist, removing this call
    // orchestrator.setPermissionsEnabled(false);
  }

  try {
    // Process the question
    const response = await orchestrator.processMessage(question);
    
    if (headlessOptions.outputFormat === 'stream-json') {
      return JSON.stringify({ 
        status: 'success', 
        response,
        timestamp: new Date().toISOString()
      });
    }

    // Response is already a string from our orchestrator implementation
    return response;
  } catch (error) {
    if (headlessOptions.outputFormat === 'stream-json') {
      return JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }

    throw error;
  }
}

/**
 * Execute a query with streaming output
 */
export async function* headlessStream(
  question: string, 
  options: HeadlessOptions = {}
): AsyncGenerator<string> {
  const headlessOptions: Required<HeadlessOptions> = {
    outputFormat: 'stream-json',
    skipPermissions: false,
    sessionId: `headless-stream-${Date.now()}`,
    timeout: 30000,
    model: 'gpt-4o',
    ...options
  };

  // Initialize analytics system
  await orchestrator.initializeAnalyticsSystem(true);

  try {
    // Stream the response
    const stream = orchestrator.processMessageStream(question);
    
    for await (const chunk of stream) {
      if (headlessOptions.outputFormat === 'stream-json') {
        yield JSON.stringify({
          type: 'chunk',
          content: chunk,
          timestamp: new Date().toISOString()
        });
      } else {
        yield chunk;
      }
    }

    if (headlessOptions.outputFormat === 'stream-json') {
      yield JSON.stringify({
        type: 'end',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    if (headlessOptions.outputFormat === 'stream-json') {
      yield JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    } else {
      throw error;
    }
  }
}

/**
 * Execute multiple queries in batch
 */
export async function headlessBatch(
  questions: string[],
  options: HeadlessOptions = {}
): Promise<Array<{ question: string; response: string; error?: string }>> {
  const results: Array<{ question: string; response: string; error?: string }> = [];
  
  for (const question of questions) {
    try {
      const response = await headlessExecute(question, options);
      results.push({ question, response });
    } catch (error) {
      results.push({ 
        question, 
        response: '', 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  return results;
}

/**
 * Get session status
 */
export function getSessionStatus() {
  const stats = orchestrator.getStats();
  return {
    messages: stats.messages,
    tokens: stats.tokens,
    uptime: process.uptime()
  };
}

/**
 * Reset session
 */
export function resetSession() {
  orchestrator.reset();
}