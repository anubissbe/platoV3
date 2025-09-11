/**
 * WebSocket Streaming Protocol for Real-time Tool Output
 * Provides WebSocket-based streaming for BashTool and other native tools
 */

import { EventEmitter } from 'events';
import { BashTool } from './bash-tool.js';
import { BashToolArgs, ToolEvent, ToolError, ErrorClass } from './types.js';

export interface WebSocketMessage {
  id: string;
  type: 'stream' | 'error' | 'complete' | 'cancel';
  timestamp: number;
  data?: any;
}

export interface StreamingSession {
  id: string;
  tool: BashTool;
  executionId?: string;
  startTime: number;
  active: boolean;
  totalEvents: number;
  totalBytes: number;
}

/**
 * WebSocket streaming adapter for real-time tool execution
 */
export class WebSocketStreaming extends EventEmitter {
  private readonly sessions: Map<string, StreamingSession> = new Map();
  private readonly maxConcurrentSessions: number = 20;
  private readonly sessionTimeout: number = 300000; // 5 minutes
  
  constructor() {
    super();
  }

  /**
   * Create a new streaming session
   */
  createSession(bashTool: BashTool): string {
    if (this.sessions.size >= this.maxConcurrentSessions) {
      throw new ToolError(
        ErrorClass.TRANSIENT,
        'MAX_SESSIONS_EXCEEDED',
        `Maximum concurrent streaming sessions (${this.maxConcurrentSessions}) exceeded`,
        { activeSessions: this.sessions.size }
      );
    }

    const sessionId = `ws-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session: StreamingSession = {
      id: sessionId,
      tool: bashTool,
      startTime: Date.now(),
      active: true,
      totalEvents: 0,
      totalBytes: 0
    };

    this.sessions.set(sessionId, session);

    // Set up session timeout
    setTimeout(() => {
      this.closeSession(sessionId, 'Session timeout');
    }, this.sessionTimeout);

    this.emit('session-created', { sessionId, timestamp: Date.now() });
    return sessionId;
  }

  /**
   * Start streaming a bash command over WebSocket
   */
  async streamCommand(sessionId: string, args: BashToolArgs): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        'SESSION_NOT_FOUND',
        `Streaming session not found: ${sessionId}`,
        { sessionId }
      );
    }

    if (!session.active) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        'SESSION_INACTIVE',
        `Streaming session is not active: ${sessionId}`,
        { sessionId }
      );
    }

    try {
      // Send start message
      this.sendMessage(sessionId, {
        id: `start-${Date.now()}`,
        type: 'stream',
        timestamp: Date.now(),
        data: {
          event: 'execution-start',
          command: args.command,
          cwd: args.cwd,
          timeout: args.timeout
        }
      });

      let sequence = 0;
      
      // Stream the bash execution
      const stream = session.tool.stream(args);
      
      for await (const event of stream) {
        if (!session.active) {
          console.log(`Session ${sessionId} became inactive, stopping stream`);
          break;
        }

        session.totalEvents++;
        if (event.bytesRead) {
          session.totalBytes += event.bytesRead;
        }

        // Convert ToolEvent to WebSocketMessage
        const message: WebSocketMessage = {
          id: `event-${sequence++}`,
          type: 'stream',
          timestamp: event.timestamp,
          data: {
            event: event.type,
            sequence: event.sequence,
            ...event.data,
            bytesRead: event.bytesRead,
            totalBytes: event.totalBytes,
            progress: event.progress,
            success: event.success
          }
        };

        this.sendMessage(sessionId, message);
        
        // Handle completion
        if (event.type === 'complete') {
          this.sendMessage(sessionId, {
            id: `complete-${Date.now()}`,
            type: 'complete',
            timestamp: Date.now(),
            data: {
              success: event.success,
              totalEvents: session.totalEvents,
              totalBytes: session.totalBytes,
              duration: Date.now() - session.startTime
            }
          });
          break;
        }
        
        // Handle errors
        if (event.type === 'error') {
          this.sendMessage(sessionId, {
            id: `error-${Date.now()}`,
            type: 'error',
            timestamp: Date.now(),
            data: {
              error: event.data,
              totalEvents: session.totalEvents,
              duration: Date.now() - session.startTime
            }
          });
          break;
        }
      }

    } catch (error) {
      // Send error message
      this.sendMessage(sessionId, {
        id: `error-${Date.now()}`,
        type: 'error',
        timestamp: Date.now(),
        data: {
          error: (error as Error).message,
          code: (error as ToolError).code,
          errorClass: (error as ToolError).errorClass
        }
      });
      
      this.closeSession(sessionId, `Execution error: ${(error as Error).message}`);
    }
  }

  /**
   * Cancel streaming for a session
   */
  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        'SESSION_NOT_FOUND',
        `Streaming session not found: ${sessionId}`,
        { sessionId }
      );
    }

    session.active = false;

    // Send cancellation message
    this.sendMessage(sessionId, {
      id: `cancel-${Date.now()}`,
      type: 'cancel',
      timestamp: Date.now(),
      data: {
        reason: 'User cancellation',
        totalEvents: session.totalEvents,
        duration: Date.now() - session.startTime
      }
    });

    // If there's an active execution, cancel it
    if (session.executionId) {
      try {
        await session.tool.cancel(session.executionId);
      } catch (error) {
        console.warn(`Failed to cancel execution ${session.executionId}: ${error}`);
      }
    }

    this.closeSession(sessionId, 'User cancellation');
  }

  /**
   * Close a streaming session
   */
  closeSession(sessionId: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.active = false;
      this.sessions.delete(sessionId);
      
      this.emit('session-closed', {
        sessionId,
        reason,
        duration: Date.now() - session.startTime,
        totalEvents: session.totalEvents,
        totalBytes: session.totalBytes,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Send a message to WebSocket clients for a session
   */
  private sendMessage(sessionId: string, message: WebSocketMessage): void {
    // Emit the message - external WebSocket server will handle actual transmission
    this.emit('message', { sessionId, message });
  }

  /**
   * Get information about active sessions
   */
  getActiveSessions(): Array<{
    sessionId: string;
    startTime: number;
    duration: number;
    totalEvents: number;
    totalBytes: number;
    active: boolean;
  }> {
    return Array.from(this.sessions.values()).map(session => ({
      sessionId: session.id,
      startTime: session.startTime,
      duration: Date.now() - session.startTime,
      totalEvents: session.totalEvents,
      totalBytes: session.totalBytes,
      active: session.active
    }));
  }

  /**
   * Close all active sessions - useful for cleanup
   */
  closeAllSessions(reason: string = 'Server shutdown'): void {
    const activeSessionIds = Array.from(this.sessions.keys());
    for (const sessionId of activeSessionIds) {
      this.closeSession(sessionId, reason);
    }
  }

  /**
   * Clean up inactive or timed-out sessions
   */
  cleanup(): void {
    const now = Date.now();
    const sessionsToClose: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (!session.active || (now - session.startTime) > this.sessionTimeout) {
        sessionsToClose.push(sessionId);
      }
    }
    
    for (const sessionId of sessionsToClose) {
      this.closeSession(sessionId, 'Session cleanup');
    }
  }
}

/**
 * WebSocket Protocol Messages
 */
export interface WSProtocolMessage {
  // Client to Server messages
  type: 'create-session' | 'stream-command' | 'cancel-session' | 'ping';
  sessionId?: string;
  data?: any;
  
  // Server to Client messages
  event?: 'session-created' | 'stream-data' | 'execution-complete' | 'error' | 'pong' | 'session-closed';
  message?: WebSocketMessage;
}

/**
 * Example WebSocket Server Integration
 * This shows how to integrate with a WebSocket server like ws or socket.io
 */
export class WebSocketServer {
  private streaming: WebSocketStreaming;
  private bashTool: BashTool;
  
  constructor() {
    this.streaming = new WebSocketStreaming();
    this.bashTool = new BashTool();
    
    // Listen for messages to broadcast to WebSocket clients
    this.streaming.on('message', ({ sessionId, message }) => {
      this.broadcastToSession(sessionId, {
        type: 'stream-command', // Using existing type from the protocol
        event: 'stream-data',
        message
      });
    });
    
    this.streaming.on('session-created', ({ sessionId }) => {
      this.broadcastToSession(sessionId, {
        type: 'create-session', // Using existing type from the protocol
        event: 'session-created',
        data: { sessionId }
      });
    });
    
    this.streaming.on('session-closed', (data) => {
      this.broadcastToSession(data.sessionId, {
        type: 'cancel-session', // Using existing type from the protocol
        event: 'session-closed',
        data
      });
    });
  }
  
  /**
   * Handle WebSocket client messages
   */
  async handleClientMessage(clientId: string, message: WSProtocolMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'create-session':
          const sessionId = this.streaming.createSession(this.bashTool);
          this.sendToClient(clientId, {
            type: 'create-session',
            event: 'session-created',
            data: { sessionId }
          });
          break;
          
        case 'stream-command':
          if (!message.sessionId || !message.data) {
            throw new Error('Invalid stream command message');
          }
          await this.streaming.streamCommand(message.sessionId, message.data);
          break;
          
        case 'cancel-session':
          if (!message.sessionId) {
            throw new Error('Invalid cancel session message');
          }
          await this.streaming.cancelSession(message.sessionId);
          break;
          
        case 'ping':
          this.sendToClient(clientId, { 
            type: 'ping',
            event: 'pong' 
          });
          break;
          
        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.sendToClient(clientId, {
        type: 'stream-command', // Using existing type from the protocol
        event: 'error',
        data: {
          error: (error as Error).message,
          originalMessage: message
        }
      });
    }
  }
  
  /**
   * Broadcast message to all clients subscribed to a session
   * Implementation depends on WebSocket library used
   */
  private broadcastToSession(sessionId: string, message: WSProtocolMessage): void {
    // This would be implemented based on your WebSocket library
    // For example, with socket.io: io.to(sessionId).emit('message', message)
    console.log(`Broadcasting to session ${sessionId}:`, message);
  }
  
  /**
   * Send message to specific client
   * Implementation depends on WebSocket library used
   */
  private sendToClient(clientId: string, message: WSProtocolMessage): void {
    // This would be implemented based on your WebSocket library
    // For example, with socket.io: io.to(clientId).emit('message', message)
    console.log(`Sending to client ${clientId}:`, message);
  }
}