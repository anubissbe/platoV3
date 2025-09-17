/**
 * Command Resilience Integration
 * 
 * Integrates circuit breaker, resource management, and validation patterns
 * for high-risk commands. Provides a unified wrapper for resilient command execution.
 */

import { CircuitBreaker, CircuitBreakerOptions, RetryConfig, circuitBreakerManager } from './circuit-breaker.js';
import { ResourceManager, ManagedResource, globalResourceManager } from './resource-manager.js';
import { CommandValidator, PathValidator, URLValidator, ValidationResult } from './validation.js';
import { ErrorHandler } from '../platform/error-handler.js';

export interface ResilientCommandOptions {
  /** Command name for logging and metrics */
  commandName: string;
  /** Circuit breaker configuration */
  circuitBreaker?: Partial<CircuitBreakerOptions>;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Input validation options */
  validation?: {
    maxArgs?: number;
    minArgs?: number;
    maxInputLength?: number;
    pathValidation?: boolean;
    urlValidation?: boolean;
  };
  /** Resource management options */
  resources?: {
    timeout?: number;
    priority?: number;
    cleanup?: boolean;
  };
  /** Enable debug logging */
  debug?: boolean;
}

export interface CommandExecutionContext {
  /** Original command arguments */
  args: string[];
  /** Validated and sanitized arguments */
  validatedArgs: string[];
  /** Resource lease IDs */
  resourceLeases: string[];
  /** Execution start time */
  startTime: number;
  /** Circuit breaker instance */
  circuitBreaker: CircuitBreaker;
  /** Error handler context */
  errorContext: {
    component: string;
    operation: string;
  };
}

export interface CommandResult {
  /** Execution success */
  success: boolean;
  /** Command output */
  output?: string;
  /** Error message */
  error?: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Validation warnings */
  warnings: string[];
  /** Whether retry was attempted */
  retried: boolean;
  /** Number of retry attempts */
  retryCount: number;
  /** Circuit breaker state */
  circuitState: string;
}

/**
 * Resilient command executor with integrated patterns
 */
export class ResilientCommandExecutor {
  private errorHandler: ErrorHandler;
  private activeExecutions = new Map<string, CommandExecutionContext>();

  constructor() {
    this.errorHandler = ErrorHandler.getInstance();
  }

  /**
   * Execute command with full resilience patterns
   */
  async executeCommand<T = any>(
    operation: (args: string[], context: CommandExecutionContext) => Promise<T>,
    args: string[],
    options: ResilientCommandOptions
  ): Promise<CommandResult> {
    const executionId = this.generateExecutionId();
    const startTime = Date.now();
    let retryCount = 0;
    let retried = false;
    const warnings: string[] = [];

    // Input validation
    const validationResult = await this.validateInputs(args, options);
    if (!validationResult.isValid) {
      return {
        success: false,
        error: `Validation failed: ${validationResult.errors.join(', ')}`,
        executionTime: Date.now() - startTime,
        warnings: validationResult.warnings,
        retried: false,
        retryCount: 0,
        circuitState: 'N/A'
      };
    }

    warnings.push(...validationResult.warnings);
    const validatedArgs = validationResult.value as string[];

    // Setup circuit breaker
    const circuitBreaker = this.setupCircuitBreaker(options);
    
    // Setup execution context
    const context: CommandExecutionContext = {
      args,
      validatedArgs,
      resourceLeases: [],
      startTime,
      circuitBreaker,
      errorContext: {
        component: 'command-executor',
        operation: options.commandName
      }
    };

    this.activeExecutions.set(executionId, context);

    try {
      // Execute with circuit breaker protection
      const result = await circuitBreaker.execute(
        async () => {
          return await this.executeWithResourceManagement(
            operation,
            validatedArgs,
            context,
            options
          );
        },
        // Fallback function
        options.validation?.pathValidation || options.validation?.urlValidation 
          ? undefined // No generic fallback for path/URL operations
          : async () => {
              if (options.debug) {
                console.log(`[ResilientCommand:${options.commandName}] Using fallback execution`);
              }
              return await this.executeFallback(validatedArgs, context, options);
            }
      );

      const stats = circuitBreaker.getStats();
      retried = stats.failureCount > 0;
      retryCount = stats.failureCount;

      return {
        success: true,
        output: typeof result === 'string' ? result : JSON.stringify(result),
        executionTime: Date.now() - startTime,
        warnings,
        retried,
        retryCount,
        circuitState: stats.state
      };
    } catch (error) {
      const stats = circuitBreaker.getStats();
      retried = stats.failureCount > 0;
      retryCount = stats.failureCount;

      // Handle error through error handler
      const errorContext = this.errorHandler.createErrorContext(
        'command-executor',
        options.commandName,
        {
          args,
          validatedArgs,
          executionTime: Date.now() - startTime,
          retryCount
        }
      );

      const recoveryResult = await this.errorHandler.handleError(
        error instanceof Error ? error : new Error(String(error)),
        errorContext
      );

      return {
        success: recoveryResult.success,
        error: recoveryResult.success 
          ? undefined 
          : (error instanceof Error ? error.message : String(error)),
        output: recoveryResult.success ? recoveryResult.messages.join('\n') : undefined,
        executionTime: Date.now() - startTime,
        warnings: [...warnings, ...recoveryResult.messages],
        retried,
        retryCount,
        circuitState: stats.state
      };
    } finally {
      // Cleanup
      await this.cleanupExecution(executionId);
    }
  }

  /**
   * Execute operation with resource management
   */
  private async executeWithResourceManagement<T>(
    operation: (args: string[], context: CommandExecutionContext) => Promise<T>,
    args: string[],
    context: CommandExecutionContext,
    options: ResilientCommandOptions
  ): Promise<T> {
    const resourceTimeout = options.resources?.timeout || 30000;
    const resourcePriority = options.resources?.priority || 5;

    // Execute with automatic resource cleanup if enabled
    if (options.resources?.cleanup) {
      let result: T;
      await globalResourceManager.withResource(
        `cmd-${options.commandName}-${Date.now()}`,
        'command-execution',
        async () => ({ operation, args, context }),
        async (resource) => {
          result = await operation(args, context);
        },
        async (resource) => {
          // Resource cleanup handled by resource manager
          if (options.debug) {
            console.log(`[ResilientCommand:${options.commandName}] Resource cleanup completed`);
          }
        },
        {
          priority: resourcePriority,
          timeout: resourceTimeout,
          metadata: {
            commandName: options.commandName,
            args: args.slice(0, 3) // Log only first 3 args for privacy
          }
        }
      );
      return result!;
    } else {
      return await operation(args, context);
    }
  }

  /**
   * Fallback execution for generic operations
   */
  private async executeFallback<T>(
    args: string[],
    context: CommandExecutionContext,
    options: ResilientCommandOptions
  ): Promise<T> {
    // Generic fallback - return safe default response
    const fallbackMessage = `Command '${options.commandName}' executed in fallback mode with reduced functionality`;
    
    if (options.debug) {
      console.log(`[ResilientCommand:${options.commandName}] ${fallbackMessage}`);
    }

    return fallbackMessage as any;
  }

  /**
   * Validate command inputs
   */
  private async validateInputs(
    args: string[],
    options: ResilientCommandOptions
  ): Promise<ValidationResult> {
    const validation = options.validation || {};
    
    // Basic argument validation
    const basicResult = CommandValidator.validateArgs(args, {
      maxArgs: validation.maxArgs,
      minArgs: validation.minArgs,
      maxInputLength: validation.maxInputLength,
      trimWhitespace: true,
      allowEmpty: false
    });

    if (!basicResult.isValid) {
      return basicResult;
    }

    const errors: string[] = [];
    const warnings: string[] = [...basicResult.warnings];

    // Path validation for path-sensitive commands
    if (validation.pathValidation) {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        // Skip flags and short args
        if (arg.startsWith('-') || arg.length < 3) {
          continue;
        }
        
        // Check if argument looks like a path
        if (arg.includes('/') || arg.includes('\\') || arg.includes('.')) {
          const pathResult = await PathValidator.validatePath(arg, {
            allowRelative: true,
            allowOutsideCwd: false,
            maxLength: 1000,
            blockedExtensions: ['exe', 'bat', 'cmd', 'scr']
          });
          
          if (!pathResult.isValid) {
            errors.push(`Argument ${i + 1} (${arg}): ${pathResult.errors.join(', ')}`);
          }
          warnings.push(...pathResult.warnings.map(w => `Argument ${i + 1} (${arg}): ${w}`));
        }
      }
    }

    // URL validation for URL-sensitive commands
    if (validation.urlValidation) {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        // Check if argument looks like a URL
        if (arg.startsWith('http://') || arg.startsWith('https://') || 
            arg.startsWith('ws://') || arg.startsWith('wss://')) {
          const urlResult = URLValidator.validateURL(arg);
          
          if (!urlResult.isValid) {
            errors.push(`Argument ${i + 1} (${arg}): ${urlResult.errors.join(', ')}`);
          }
          warnings.push(...urlResult.warnings.map(w => `Argument ${i + 1} (${arg}): ${w}`));
        }
      }
    }

    return {
      isValid: errors.length === 0,
      value: basicResult.value,
      errors,
      warnings
    };
  }

  /**
   * Setup circuit breaker for command
   */
  private setupCircuitBreaker(options: ResilientCommandOptions): CircuitBreaker {
    const cbOptions = options.circuitBreaker || {};
    const retryOptions = options.retry || {};

    return circuitBreakerManager.getOrCreate(
      options.commandName,
      {
        failureThreshold: 3,
        resetTimeout: 60000,
        timeout: 30000,
        monitoringPeriod: 120000,
        expectedFailureRate: 0.5,
        minimumCalls: 2,
        enableDebug: options.debug,
        ...cbOptions
      },
      {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: true,
        ...retryOptions
      }
    );
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup execution resources
   */
  private async cleanupExecution(executionId: string): Promise<void> {
    const context = this.activeExecutions.get(executionId);
    if (!context) {
      return;
    }

    // Release any resource leases
    for (const leaseId of context.resourceLeases) {
      await globalResourceManager.release(leaseId);
    }

    this.activeExecutions.delete(executionId);
  }

  /**
   * Get statistics for all circuit breakers
   */
  getCircuitBreakerStats(): Record<string, any> {
    return circuitBreakerManager.getAllStats();
  }

  /**
   * Get resource usage statistics
   */
  getResourceStats() {
    return globalResourceManager.getStats();
  }

  /**
   * Force cleanup of all resources
   */
  async cleanup(): Promise<void> {
    // Cleanup active executions
    const executionIds = Array.from(this.activeExecutions.keys());
    await Promise.all(executionIds.map(id => this.cleanupExecution(id)));
    
    // Force resource cleanup
    await globalResourceManager.forceCleanup();
    
    // Reset circuit breakers
    circuitBreakerManager.resetAll();
  }
}

// Global instance
export const resilientCommandExecutor = new ResilientCommandExecutor();

/**
 * Decorator for making slash commands resilient
 */
export function makeResilient(
  commandName: string,
  options: Partial<ResilientCommandOptions> = {}
) {
  return function <T extends any[], R>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
  ) {
    const method = descriptor.value!;
    
    descriptor.value = async function (...args: T): Promise<R> {
      const finalOptions: ResilientCommandOptions = {
        commandName,
        debug: false,
        ...options
      };

      const argsAsStrings = args.map(arg => String(arg));
      
      const result = await resilientCommandExecutor.executeCommand(
        async (validatedArgs, context) => {
          // Convert back to original argument types
          const convertedArgs = validatedArgs.map((arg, index) => 
            typeof args[index] === 'number' ? parseFloat(arg) : arg
          ) as T;
          
          return await method.apply(this, convertedArgs);
        },
        argsAsStrings,
        finalOptions
      );

      if (!result.success) {
        throw new Error(result.error || 'Command execution failed');
      }

      return result.output as R;
    };
  };
}
