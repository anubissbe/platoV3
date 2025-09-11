import { EventEmitter } from 'events';
import * as path from 'path';
import { PermissionQuery, PermissionResult } from './types.js';

/**
 * Safety guard system to prevent dangerous operations
 * Provides protection against critical system modifications
 */
export class SafetyGuard extends EventEmitter {
  // Protected system paths that should never be modified
  private static readonly PROTECTED_PATHS = [
    '/etc',
    '/sys',
    '/proc',
    '/boot',
    '/dev',
    '/usr/bin',
    '/usr/sbin',
    '/bin',
    '/sbin',
    '/lib',
    '/lib64',
    '/Windows/System32',
    '/System',
    '/.git/objects',
  ];

  // Dangerous command patterns
  private static readonly DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//,
    /chmod\s+777/,
    /chown\s+.*:/,
    />\/dev\/s/,
    /dd\s+if=/,
    /mkfs/,
    /format\s+[cC]:/,
  ];

  // Rate limiting configuration
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly RATE_LIMITS = {
    'fs_delete': 10,
    'fs_write': 30,
    'exec': 5,
    'http': 20,
  };

  // Operation snapshots for rollback
  private snapshots: Map<string, any> = new Map();
  private readonly MAX_SNAPSHOTS = 100;

  /**
   * Check if a path is protected
   */
  isProtectedPath(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    return SafetyGuard.PROTECTED_PATHS.some(protectedPath => 
      normalized.startsWith(protectedPath) || normalized === protectedPath
    );
  }

  /**
   * Validate an operation before execution
   */
  validateOperation(query: PermissionQuery): {
    valid: boolean;
    reason?: string;
    suggestions?: string[];
  } {
    // Check protected paths
    if (query.path && this.isProtectedPath(query.path)) {
      return {
        valid: false,
        reason: `Protected system path: ${query.path}`,
        suggestions: [
          'Use a different path outside system directories',
          'Consider using a sandbox or container environment',
        ],
      };
    }

    // Check dangerous patterns
    if (query.command) {
      for (const pattern of SafetyGuard.DANGEROUS_PATTERNS) {
        if (pattern.test(query.command)) {
          return {
            valid: false,
            reason: `Dangerous command pattern detected: ${pattern.source}`,
            suggestions: [
              'Review the command for safety',
              'Use safer alternatives',
              'Run in a sandboxed environment',
            ],
          };
        }
      }
    }

    // Check rate limits
    const rateCheck = this.checkRateLimit(query.tool);
    if (!rateCheck.allowed) {
      return {
        valid: false,
        reason: `Rate limit exceeded for ${query.tool}`,
        suggestions: [
          `Wait ${Math.ceil(rateCheck.retryAfter / 1000)} seconds`,
          'Batch operations to reduce frequency',
        ],
      };
    }

    return { valid: true };
  }

  /**
   * Check rate limits for operations
   */
  checkRateLimit(tool: string): {
    allowed: boolean;
    remaining: number;
    retryAfter: number;
  } {
    const limit = this.RATE_LIMITS[tool as keyof typeof this.RATE_LIMITS];
    if (!limit) {
      return { allowed: true, remaining: Infinity, retryAfter: 0 };
    }

    const now = Date.now();
    const current = this.rateLimits.get(tool);

    if (!current || now > current.resetTime) {
      this.rateLimits.set(tool, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW,
      });
      return { allowed: true, remaining: limit - 1, retryAfter: 0 };
    }

    if (current.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: current.resetTime - now,
      };
    }

    current.count++;
    return {
      allowed: true,
      remaining: limit - current.count,
      retryAfter: 0,
    };
  }

  /**
   * Create a snapshot before an operation
   */
  createSnapshot(id: string, data: any): void {
    // Limit snapshot storage
    if (this.snapshots.size >= this.MAX_SNAPSHOTS) {
      const firstKey = this.snapshots.keys().next().value;
      if (firstKey !== undefined) {
        this.snapshots.delete(firstKey);
      }
    }

    this.snapshots.set(id, {
      timestamp: Date.now(),
      data: JSON.parse(JSON.stringify(data)), // Deep clone
    });

    this.emit('snapshotCreated', { id, size: this.snapshots.size });
  }

  /**
   * Rollback to a previous snapshot
   */
  rollback(id: string): any {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      throw new Error(`Snapshot ${id} not found`);
    }

    this.emit('rollback', { id, snapshot });
    return snapshot.data;
  }

  /**
   * Detect dangerous patterns in operations
   */
  detectDangerousPatterns(query: PermissionQuery): {
    dangerous: boolean;
    patterns: string[];
    riskScore: number;
  } {
    const patterns: string[] = [];
    let riskScore = 0;

    // Check for recursive deletion
    if (query.tool === 'fs_delete' && query.metadata?.recursive) {
      patterns.push('Recursive deletion');
      riskScore += 30;
    }

    // Check for wildcard operations
    if (query.path && query.path.includes('*')) {
      patterns.push('Wildcard operation');
      riskScore += 20;
    }

    // Check for system file modifications
    if (query.path && /\.(dll|so|dylib|sys)$/i.test(query.path)) {
      patterns.push('System file modification');
      riskScore += 40;
    }

    // Check for database operations
    if (query.command && /DROP|TRUNCATE|DELETE.*WHERE.*1.*=.*1/i.test(query.command)) {
      patterns.push('Dangerous database operation');
      riskScore += 50;
    }

    // Check for network operations
    if (query.tool === 'http' && query.metadata?.method === 'DELETE') {
      patterns.push('HTTP DELETE operation');
      riskScore += 25;
    }

    return {
      dangerous: riskScore >= 30,
      patterns,
      riskScore,
    };
  }

  /**
   * Perform pre-flight checks before operations
   */
  async preFlightCheck(query: PermissionQuery): Promise<{
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      message: string;
    }>;
  }> {
    const checks = [];

    // Path protection check
    const pathCheck = {
      name: 'Path Protection',
      passed: !query.path || !this.isProtectedPath(query.path),
      message: query.path && this.isProtectedPath(query.path)
        ? `Protected path: ${query.path}`
        : 'Path is safe',
    };
    checks.push(pathCheck);

    // Pattern detection check
    const patternCheck = this.detectDangerousPatterns(query);
    checks.push({
      name: 'Pattern Detection',
      passed: !patternCheck.dangerous,
      message: patternCheck.dangerous
        ? `Dangerous patterns: ${patternCheck.patterns.join(', ')}`
        : 'No dangerous patterns detected',
    });

    // Rate limit check
    const rateCheck = this.checkRateLimit(query.tool);
    checks.push({
      name: 'Rate Limiting',
      passed: rateCheck.allowed,
      message: rateCheck.allowed
        ? `${rateCheck.remaining} operations remaining`
        : `Rate limit exceeded, retry after ${Math.ceil(rateCheck.retryAfter / 1000)}s`,
    });

    // Validation check
    const validation = this.validateOperation(query);
    checks.push({
      name: 'Operation Validation',
      passed: validation.valid,
      message: validation.reason || 'Operation is valid',
    });

    const passed = checks.every(check => check.passed);
    this.emit('preFlightComplete', { query, passed, checks });

    return { passed, checks };
  }

  /**
   * Get safety statistics
   */
  getStatistics(): {
    protectedPaths: number;
    dangerousPatterns: number;
    rateLimits: Record<string, any>;
    snapshots: number;
  } {
    return {
      protectedPaths: SafetyGuard.PROTECTED_PATHS.length,
      dangerousPatterns: SafetyGuard.DANGEROUS_PATTERNS.length,
      rateLimits: Object.fromEntries(
        Array.from(this.rateLimits.entries()).map(([key, value]) => [
          key,
          {
            count: value.count,
            remaining: (this.RATE_LIMITS[key as keyof typeof this.RATE_LIMITS] || 0) - value.count,
            resetsIn: Math.max(0, value.resetTime - Date.now()),
          },
        ])
      ),
      snapshots: this.snapshots.size,
    };
  }

  /**
   * Reset rate limits
   */
  resetRateLimits(): void {
    this.rateLimits.clear();
    this.emit('rateLimitsReset');
  }

  /**
   * Clear all snapshots
   */
  clearSnapshots(): void {
    const count = this.snapshots.size;
    this.snapshots.clear();
    this.emit('snapshotsCleared', { count });
  }
}