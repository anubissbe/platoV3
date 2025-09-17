/**
 * Circuit Breaker Pattern Implementation
 * 
 * Provides automatic retry, exponential backoff, and fallback mechanisms
 * for external service dependencies and high-risk operations.
 */

export interface CircuitBreakerOptions {
  /** Failure threshold before opening circuit */
  failureThreshold: number;
  /** Reset timeout when circuit is open (ms) */
  resetTimeout: number;
  /** Timeout for individual operations (ms) */
  timeout: number;
  /** Monitor window for failure tracking (ms) */
  monitoringPeriod: number;
  /** Expected failure rate threshold (0-1) */
  expectedFailureRate: number;
  /** Minimum calls before circuit can open */
  minimumCalls: number;
  /** Enable debug logging */
  enableDebug?: boolean;
}

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextRetryTime?: number;
  totalCalls: number;
  failureRate: number;
}

export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay between retries (ms) */
  baseDelay: number;
  /** Maximum delay between retries (ms) */
  maxDelay: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd */
  jitter: boolean;
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public state: CircuitState) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker<T = any> {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextRetryTime = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private readonly failureHistory: number[] = [];
  private stateChangeListeners: Array<(state: CircuitState) => void> = [];

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions,
    private readonly retryConfig?: RetryConfig
  ) {
    if (options.enableDebug) {
      console.log(`[CircuitBreaker:${name}] Initialized with options:`, options);
    }
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<TResult = T>(
    operation: () => Promise<TResult>,
    fallback?: () => Promise<TResult>
  ): Promise<TResult> {
    this.cleanOldFailures();
    
    if (!this.canExecute()) {
      const error = new CircuitBreakerError(
        `Circuit breaker '${this.name}' is ${this.state}. Next retry at ${new Date(this.nextRetryTime).toISOString()}`,
        this.state
      );
      
      if (fallback) {
        if (this.options.enableDebug) {
          console.log(`[CircuitBreaker:${this.name}] Using fallback due to ${this.state} state`);
        }
        return await this.executeWithTimeout(fallback, this.options.timeout);
      }
      
      throw error;
    }

    return this.executeWithRetry(operation, fallback);
  }

  /**
   * Execute with automatic retry and exponential backoff
   */
  private async executeWithRetry<TResult>(
    operation: () => Promise<TResult>,
    fallback?: () => Promise<TResult>,
    attemptNumber = 1
  ): Promise<TResult> {
    try {
      const result = await this.executeWithTimeout(operation, this.options.timeout);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      const shouldRetry = this.retryConfig && attemptNumber < this.retryConfig.maxRetries;
      
      if (shouldRetry && this.canExecute()) {
        const delay = this.calculateRetryDelay(attemptNumber);
        
        if (this.options.enableDebug) {
          console.log(`[CircuitBreaker:${this.name}] Retry ${attemptNumber}/${this.retryConfig!.maxRetries} after ${delay}ms`);
        }
        
        await this.sleep(delay);
        return this.executeWithRetry(operation, fallback, attemptNumber + 1);
      }
      
      // Final failure - try fallback
      if (fallback && this.state !== CircuitState.OPEN) {
        if (this.options.enableDebug) {
          console.log(`[CircuitBreaker:${this.name}] Using fallback after ${attemptNumber} attempts`);
        }
        return await this.executeWithTimeout(fallback, this.options.timeout);
      }
      
      throw error;
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<TResult>(
    operation: () => Promise<TResult>,
    timeoutMs: number
  ): Promise<TResult> {
    return new Promise<TResult>(async (resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await operation();
        clearTimeout(timeoutHandle);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  /**
   * Check if operation can execute
   */
  private canExecute(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
      case CircuitState.OPEN:
        return Date.now() >= this.nextRetryTime;
      case CircuitState.HALF_OPEN:
        return true;
      default:
        return false;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.closeCircuit();
    }
    
    if (this.options.enableDebug) {
      console.log(`[CircuitBreaker:${this.name}] Success recorded. State: ${this.state}, Success count: ${this.successCount}`);
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.failureHistory.push(Date.now());
    
    if (this.shouldOpenCircuit()) {
      this.openCircuit();
    }
    
    if (this.options.enableDebug) {
      console.log(`[CircuitBreaker:${this.name}] Failure recorded. State: ${this.state}, Failure count: ${this.failureCount}`);
    }
  }

  /**
   * Determine if circuit should open
   */
  private shouldOpenCircuit(): boolean {
    const totalCalls = this.getTotalCallsInWindow();
    
    if (totalCalls < this.options.minimumCalls) {
      return false;
    }
    
    const recentFailures = this.getRecentFailures();
    const failureRate = recentFailures / totalCalls;
    
    return failureRate >= this.options.expectedFailureRate && 
           this.failureCount >= this.options.failureThreshold;
  }

  /**
   * Open the circuit
   */
  private openCircuit(): void {
    if (this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.nextRetryTime = Date.now() + this.options.resetTimeout;
      this.notifyStateChange(CircuitState.OPEN);
      
      if (this.options.enableDebug) {
        console.log(`[CircuitBreaker:${this.name}] Circuit opened. Next retry at ${new Date(this.nextRetryTime).toISOString()}`);
      }
    }
  }

  /**
   * Close the circuit
   */
  private closeCircuit(): void {
    if (this.state !== CircuitState.CLOSED) {
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      this.nextRetryTime = 0;
      this.notifyStateChange(CircuitState.CLOSED);
      
      if (this.options.enableDebug) {
        console.log(`[CircuitBreaker:${this.name}] Circuit closed`);
      }
    }
  }

  /**
   * Transition to half-open state
   */
  private halfOpenCircuit(): void {
    if (this.state !== CircuitState.HALF_OPEN) {
      this.state = CircuitState.HALF_OPEN;
      this.notifyStateChange(CircuitState.HALF_OPEN);
      
      if (this.options.enableDebug) {
        console.log(`[CircuitBreaker:${this.name}] Circuit half-opened`);
      }
    }
  }

  /**
   * Get total calls in monitoring window
   */
  private getTotalCallsInWindow(): number {
    const windowStart = Date.now() - this.options.monitoringPeriod;
    return this.failureHistory.filter(time => time >= windowStart).length + this.successCount;
  }

  /**
   * Get recent failures in monitoring window
   */
  private getRecentFailures(): number {
    const windowStart = Date.now() - this.options.monitoringPeriod;
    return this.failureHistory.filter(time => time >= windowStart).length;
  }

  /**
   * Clean old failure records outside monitoring window
   */
  private cleanOldFailures(): void {
    const windowStart = Date.now() - this.options.monitoringPeriod;
    const newLength = this.failureHistory.findIndex(time => time >= windowStart);
    if (newLength > 0) {
      this.failureHistory.splice(0, newLength);
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attemptNumber: number): number {
    if (!this.retryConfig) return 0;
    
    const { baseDelay, maxDelay, backoffMultiplier, jitter } = this.retryConfig;
    
    let delay = baseDelay * Math.pow(backoffMultiplier, attemptNumber - 1);
    delay = Math.min(delay, maxDelay);
    
    if (jitter) {
      // Add ±25% jitter
      const jitterRange = delay * 0.25;
      delay += (Math.random() - 0.5) * 2 * jitterRange;
    }
    
    return Math.max(0, Math.floor(delay));
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Notify listeners of state changes
   */
  private notifyStateChange(newState: CircuitState): void {
    this.stateChangeListeners.forEach(listener => {
      try {
        listener(newState);
      } catch (error) {
        console.error(`[CircuitBreaker:${this.name}] Error in state change listener:`, error);
      }
    });
  }

  /**
   * Add state change listener
   */
  onStateChange(listener: (state: CircuitState) => void): void {
    this.stateChangeListeners.push(listener);
  }

  /**
   * Remove state change listener
   */
  removeStateChangeListener(listener: (state: CircuitState) => void): void {
    const index = this.stateChangeListeners.indexOf(listener);
    if (index > -1) {
      this.stateChangeListeners.splice(index, 1);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    const totalCalls = this.getTotalCallsInWindow();
    const recentFailures = this.getRecentFailures();
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextRetryTime: this.nextRetryTime || undefined,
      totalCalls,
      failureRate: totalCalls > 0 ? recentFailures / totalCalls : 0
    };
  }

  /**
   * Reset circuit breaker state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextRetryTime = 0;
    this.failureHistory.length = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    
    if (this.options.enableDebug) {
      console.log(`[CircuitBreaker:${this.name}] Reset to initial state`);
    }
  }

  /**
   * Force circuit open (for testing or maintenance)
   */
  forceOpen(resetTimeoutMs?: number): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = Date.now() + (resetTimeoutMs || this.options.resetTimeout);
    this.notifyStateChange(CircuitState.OPEN);
    
    if (this.options.enableDebug) {
      console.log(`[CircuitBreaker:${this.name}] Force opened until ${new Date(this.nextRetryTime).toISOString()}`);
    }
  }

  /**
   * Force circuit closed (for testing or manual recovery)
   */
  forceClosed(): void {
    this.closeCircuit();
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    timeout: 30000,      // 30 seconds  
    monitoringPeriod: 120000, // 2 minutes
    expectedFailureRate: 0.5,  // 50%
    minimumCalls: 3,
    enableDebug: false
  };
  
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  };

  /**
   * Create or get circuit breaker
   */
  getOrCreate(
    name: string, 
    options?: Partial<CircuitBreakerOptions>,
    retryConfig?: Partial<RetryConfig>
  ): CircuitBreaker {
    if (!this.breakers.has(name)) {
      const finalOptions = { ...this.defaultOptions, ...options };
      const finalRetryConfig = { ...this.defaultRetryConfig, ...retryConfig };
      
      const breaker = new CircuitBreaker(name, finalOptions, finalRetryConfig);
      this.breakers.set(name, breaker);
      
      if (finalOptions.enableDebug) {
        console.log(`[CircuitBreakerManager] Created circuit breaker '${name}'`);
      }
    }
    
    return this.breakers.get(name)!;
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  /**
   * Get stats for all circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Remove circuit breaker
   */
  remove(name: string): boolean {
    return this.breakers.delete(name);
  }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();
