/**
 * Error Classifier - Claude Code-compatible error classification and retry policies
 * Maps system errors to standardized error classes with appropriate retry behavior
 */

import { ToolError, ErrorClass } from './types.js';

export interface ErrorClassificationResult {
  errorClass: ErrorClass;
  code: string;
  message: string;
  retryable: boolean;
  retryAfter?: number;
  maxRetries?: number;
  backoffMultiplier?: number;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
  jitter: boolean;
}

/**
 * Claude Code-compatible error classifier
 */
export class ErrorClassifier {
  
  // Claude Code error mapping table
  private static readonly ERROR_MAPPINGS: Record<string, {
    errorClass: ErrorClass;
    retryable: boolean;
    baseRetryDelay?: number;
    maxRetries?: number;
  }> = {
    // File system errors - permanent
    'ENOENT': { errorClass: ErrorClass.PERMANENT, retryable: false },
    'ENOTDIR': { errorClass: ErrorClass.PERMANENT, retryable: false },
    'EISDIR': { errorClass: ErrorClass.PERMANENT, retryable: false },
    'EEXIST': { errorClass: ErrorClass.PERMANENT, retryable: false },
    'EINVAL': { errorClass: ErrorClass.VALIDATION, retryable: false },
    'ENAMETOOLONG': { errorClass: ErrorClass.VALIDATION, retryable: false },
    
    // Permission errors - permanent
    'EACCES': { errorClass: ErrorClass.PERMISSION, retryable: false },
    'EPERM': { errorClass: ErrorClass.PERMISSION, retryable: false },
    'EROFS': { errorClass: ErrorClass.PERMISSION, retryable: false },
    
    // Transient file system errors
    'EMFILE': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 100, maxRetries: 3 },
    'ENFILE': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 100, maxRetries: 3 },
    'ENOSPC': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 1000, maxRetries: 2 },
    'EIO': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 500, maxRetries: 3 },
    'EBUSY': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 200, maxRetries: 5 },
    'EAGAIN': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 50, maxRetries: 5 },
    'EWOULDBLOCK': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 50, maxRetries: 5 },
    
    // Timeout errors
    'TIMEOUT': { errorClass: ErrorClass.TIMEOUT, retryable: false },
    'ETIMEDOUT': { errorClass: ErrorClass.TIMEOUT, retryable: false },
    
    // Network-like errors (for future MCP integration)
    'ECONNRESET': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 1000, maxRetries: 3 },
    'ECONNREFUSED': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 1000, maxRetries: 3 },
    'EHOSTUNREACH': { errorClass: ErrorClass.TRANSIENT, retryable: true, baseRetryDelay: 2000, maxRetries: 2 },
    
    // Process execution errors
    'SIGKILL': { errorClass: ErrorClass.TIMEOUT, retryable: false },
    'SIGTERM': { errorClass: ErrorClass.TIMEOUT, retryable: false },
    'SIGINT': { errorClass: ErrorClass.TIMEOUT, retryable: false },
  };

  // Default retry policies by error class
  private static readonly DEFAULT_RETRY_POLICIES: Record<ErrorClass, RetryPolicy> = {
    [ErrorClass.TRANSIENT]: {
      maxRetries: 3,
      baseDelay: 100,
      backoffMultiplier: 2.0,
      maxDelay: 5000,
      jitter: true
    },
    [ErrorClass.PERMANENT]: {
      maxRetries: 0,
      baseDelay: 0,
      backoffMultiplier: 1,
      maxDelay: 0,
      jitter: false
    },
    [ErrorClass.VALIDATION]: {
      maxRetries: 0,
      baseDelay: 0,
      backoffMultiplier: 1,
      maxDelay: 0,
      jitter: false
    },
    [ErrorClass.PERMISSION]: {
      maxRetries: 0,
      baseDelay: 0,
      backoffMultiplier: 1,
      maxDelay: 0,
      jitter: false
    },
    [ErrorClass.TIMEOUT]: {
      maxRetries: 1, // One retry for timeout
      baseDelay: 1000,
      backoffMultiplier: 1,
      maxDelay: 1000,
      jitter: false
    }
  };

  /**
   * Classify an error and determine retry behavior
   */
  static classifyError(error: Error | string | { code?: string; errno?: number }): ErrorClassificationResult {
    let code: string;
    let message: string;

    if (typeof error === 'string') {
      code = 'GENERIC_ERROR';
      message = error;
    } else if (error instanceof Error) {
      code = (error as any).code || (error as any).errno?.toString() || 'GENERIC_ERROR';
      message = error.message;
    } else {
      code = error.code || error.errno?.toString() || 'GENERIC_ERROR';
      message = 'Unknown error';
    }

    // Look up the error mapping
    const mapping = this.ERROR_MAPPINGS[code];
    if (mapping) {
      const policy = this.getRetryPolicy(mapping.errorClass);
      
      return {
        errorClass: mapping.errorClass,
        code,
        message: this.standardizeErrorMessage(code, message),
        retryable: mapping.retryable,
        retryAfter: mapping.baseRetryDelay,
        maxRetries: mapping.maxRetries || policy.maxRetries,
        backoffMultiplier: policy.backoffMultiplier
      };
    }

    // Default classification for unknown errors
    return {
      errorClass: ErrorClass.PERMANENT,
      code,
      message: this.standardizeErrorMessage(code, message),
      retryable: false,
      maxRetries: 0
    };
  }

  /**
   * Create a standardized ToolError from classification
   */
  static createToolError(error: Error | string | { code?: string; errno?: number }, details?: any): ToolError {
    const classification = this.classifyError(error);
    
    return new ToolError(
      classification.errorClass,
      classification.code,
      classification.message,
      details,
      classification.retryAfter
    );
  }

  /**
   * Get retry policy for an error class
   */
  static getRetryPolicy(errorClass: ErrorClass): RetryPolicy {
    return { ...this.DEFAULT_RETRY_POLICIES[errorClass] };
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  static calculateRetryDelay(
    attempt: number,
    policy: RetryPolicy,
    baseDelay?: number
  ): number {
    const delay = baseDelay || policy.baseDelay;
    let calculatedDelay = delay * Math.pow(policy.backoffMultiplier, attempt);
    
    // Apply maximum delay cap
    calculatedDelay = Math.min(calculatedDelay, policy.maxDelay);
    
    // Apply jitter if enabled
    if (policy.jitter) {
      const jitterAmount = calculatedDelay * 0.1; // 10% jitter
      calculatedDelay += (Math.random() - 0.5) * 2 * jitterAmount;
    }
    
    return Math.max(0, Math.floor(calculatedDelay));
  }

  /**
   * Check if an error should be retried
   */
  static shouldRetry(error: ToolError, attemptCount: number): boolean {
    if (!error.retryable) {
      return false;
    }

    const policy = this.getRetryPolicy(error.errorClass);
    return attemptCount < policy.maxRetries;
  }

  /**
   * Standardize error messages to match Claude Code format
   */
  private static standardizeErrorMessage(code: string, originalMessage: string): string {
    // Map common error codes to Claude Code-compatible messages
    const messageMap: Record<string, string> = {
      'ENOENT': 'File or directory not found',
      'EACCES': 'Permission denied',
      'EPERM': 'Operation not permitted',
      'EISDIR': 'Is a directory',
      'ENOTDIR': 'Not a directory',
      'EEXIST': 'File already exists',
      'ENOSPC': 'No space left on device',
      'EMFILE': 'Too many open files',
      'ENFILE': 'File table overflow',
      'EIO': 'Input/output error',
      'EBUSY': 'Device or resource busy',
      'EROFS': 'Read-only file system',
      'EINVAL': 'Invalid argument',
      'ENAMETOOLONG': 'File name too long',
      'TIMEOUT': 'Operation timed out',
      'ETIMEDOUT': 'Connection timed out',
      'ECONNRESET': 'Connection reset',
      'ECONNREFUSED': 'Connection refused',
      'EHOSTUNREACH': 'Host unreachable'
    };

    return messageMap[code] || originalMessage || `Error: ${code}`;
  }

  /**
   * Get human-readable error class name
   */
  static getErrorClassName(errorClass: ErrorClass): string {
    const nameMap: Record<ErrorClass, string> = {
      [ErrorClass.TRANSIENT]: 'Transient Error',
      [ErrorClass.PERMANENT]: 'Permanent Error',
      [ErrorClass.VALIDATION]: 'Validation Error',
      [ErrorClass.PERMISSION]: 'Permission Error',
      [ErrorClass.TIMEOUT]: 'Timeout Error'
    };

    return nameMap[errorClass] || 'Unknown Error';
  }

  /**
   * Create error summary for debugging
   */
  static createErrorSummary(error: ToolError): {
    class: string;
    code: string;
    message: string;
    retryable: boolean;
    policy: RetryPolicy;
  } {
    return {
      class: this.getErrorClassName(error.errorClass),
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      policy: this.getRetryPolicy(error.errorClass)
    };
  }

  /**
   * Validate error classification consistency
   */
  static validateClassification(error: ToolError): boolean {
    const classification = this.classifyError({
      code: error.code,
      message: error.message
    } as any);

    return classification.errorClass === error.errorClass;
  }
}