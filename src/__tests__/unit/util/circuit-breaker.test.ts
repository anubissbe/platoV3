/**
 * Unit Tests for Circuit Breaker Pattern
 */

import { CircuitBreaker, CircuitState, circuitBreakerManager } from '../../../utils/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 2,
      resetTimeout: 1000,
      timeout: 500,
      monitoringPeriod: 5000,
      expectedFailureRate: 0.5,
      minimumCalls: 2,
      enableDebug: false
    }, {
      maxRetries: 2,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false
    });
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('Basic Functionality', () => {
    test('should start in closed state', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    test('should execute successful operations', async () => {
      const result = await circuitBreaker.execute(async () => {
        return 'success';
      });

      expect(result).toBe('success');
      
      const stats = circuitBreaker.getStats();
      expect(stats.successCount).toBe(1);
    });

    test('should handle failed operations', async () => {
      await expect(async () => {
        await circuitBreaker.execute(async () => {
          throw new Error('Test failure');
        });
      }).rejects.toThrow('Test failure');

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBeGreaterThan(0);
    });
  });

  describe('Circuit States', () => {
    test('should open circuit after threshold failures', async () => {
      // Force failures to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Forced failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    test('should use fallback when circuit is open', async () => {
      // Open the circuit
      circuitBreaker.forceOpen();

      const result = await circuitBreaker.execute(
        async () => {
          throw new Error('Should not execute');
        },
        async () => {
          return 'fallback result';
        }
      );

      expect(result).toBe('fallback result');
    });

    test('should reset circuit state', () => {
      circuitBreaker.forceOpen();
      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);

      circuitBreaker.reset();
      expect(circuitBreaker.getStats().state).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });
  });

  describe('Timeout Handling', () => {
    test('should timeout long operations', async () => {
      await expect(async () => {
        await circuitBreaker.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return 'should not complete';
        });
      }).rejects.toThrow('Operation timed out after 500ms');
    });
  });

  describe('Retry Logic', () => {
    test('should retry failed operations', async () => {
      let attemptCount = 0;

      const result = await circuitBreaker.execute(async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return `Success on attempt ${attemptCount}`;
      });

      expect(result).toBe('Success on attempt 2');
      expect(attemptCount).toBe(2);
    });
  });
});

describe('CircuitBreakerManager', () => {
  afterEach(() => {
    circuitBreakerManager.resetAll();
  });

  test('should create and manage circuit breakers', () => {
    const breaker1 = circuitBreakerManager.getOrCreate('service1');
    const breaker2 = circuitBreakerManager.getOrCreate('service2');
    const breaker1Again = circuitBreakerManager.getOrCreate('service1');

    expect(breaker1).toBeInstanceOf(CircuitBreaker);
    expect(breaker2).toBeInstanceOf(CircuitBreaker);
    expect(breaker1).toBe(breaker1Again); // Should return same instance
    expect(breaker1).not.toBe(breaker2); // Should be different instances
  });

  test('should get stats for all circuit breakers', () => {
    circuitBreakerManager.getOrCreate('service1');
    circuitBreakerManager.getOrCreate('service2');

    const allStats = circuitBreakerManager.getAllStats();
    
    expect(Object.keys(allStats)).toContain('service1');
    expect(Object.keys(allStats)).toContain('service2');
    expect(allStats.service1.state).toBe(CircuitState.CLOSED);
    expect(allStats.service2.state).toBe(CircuitState.CLOSED);
  });

  test('should reset all circuit breakers', () => {
    const breaker1 = circuitBreakerManager.getOrCreate('service1');
    const breaker2 = circuitBreakerManager.getOrCreate('service2');

    breaker1.forceOpen();
    breaker2.forceOpen();

    expect(breaker1.getStats().state).toBe(CircuitState.OPEN);
    expect(breaker2.getStats().state).toBe(CircuitState.OPEN);

    circuitBreakerManager.resetAll();

    expect(breaker1.getStats().state).toBe(CircuitState.CLOSED);
    expect(breaker2.getStats().state).toBe(CircuitState.CLOSED);
  });
});
