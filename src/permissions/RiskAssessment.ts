import { PermissionQuery, RiskLevel } from './types';
import * as path from 'path';

/**
 * Risk assessment engine for permission operations
 * Analyzes operations and paths to determine risk levels
 */
export class RiskAssessment {
  // Critical system paths that should never be modified
  private static readonly CRITICAL_PATHS = [
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers',
    '/boot',
    '/sys',
    '/proc',
    '/.git/objects',
    '/Windows/System32',
    '/System/Library',
  ];

  // Sensitive paths that require caution
  private static readonly SENSITIVE_PATHS = [
    '/etc',
    '/usr/bin',
    '/usr/sbin',
    '/bin',
    '/sbin',
    '/.ssh',
    '/.gnupg',
    '/root',
    process.env.HOME + '/.ssh',
    process.env.HOME + '/.gnupg',
    '/.env',
    '/config',
    '/secrets',
    '/.git/config',
    '/node_modules/.bin',
  ];

  // Dangerous operations
  private static readonly DANGEROUS_OPERATIONS = {
    'fs_delete': { base: 'high', patterns: ['rm -rf', 'del /f'] },
    'fs_write': { base: 'medium', patterns: ['>', '>>'] },
    'exec': { base: 'high', patterns: ['sudo', 'su', 'chmod', 'chown'] },
    'http': { base: 'medium', patterns: ['POST', 'PUT', 'DELETE', 'PATCH'] },
    'database': { base: 'high', patterns: ['DROP', 'TRUNCATE', 'DELETE', 'ALTER'] },
  };

  // Dangerous command patterns
  private static readonly DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//i,
    /chmod\s+777/i,
    /curl.*\|\s*sh/i,
    /wget.*\|\s*bash/i,
    /eval\s*\(/i,
    /exec\s*\(/i,
    /DROP\s+TABLE/i,
    /TRUNCATE\s+TABLE/i,
    /DELETE\s+FROM.*WHERE\s+1\s*=\s*1/i,
  ];

  /**
   * Assess the risk level of a permission query
   */
  static assessRisk(query: PermissionQuery): {
    level: RiskLevel;
    score: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 0;

    // Assess path risk
    if (query.path) {
      const pathRisk = this.assessPathRisk(query.path);
      score += pathRisk.score;
      factors.push(...pathRisk.factors);
    }

    // Assess operation risk
    if (query.tool && query.operation) {
      const opRisk = this.assessOperationRisk(query.tool, query.operation);
      score += opRisk.score;
      factors.push(...opRisk.factors);
    }

    // Assess command risk
    if (query.command) {
      const cmdRisk = this.assessCommandRisk(query.command);
      score += cmdRisk.score;
      factors.push(...cmdRisk.factors);
    }

    // Check for batch operations
    if (query.metadata?.affectedFiles && query.metadata.affectedFiles > 10) {
      score += 20;
      factors.push(`Batch operation affecting ${query.metadata.affectedFiles} files`);
    }

    // Check for recursive operations
    if (query.metadata?.recursive) {
      score += 15;
      factors.push('Recursive operation');
    }

    // Determine risk level based on score
    const level = this.scoreToRiskLevel(score);

    return { level, score, factors };
  }

  /**
   * Assess risk based on file path
   */
  private static assessPathRisk(filePath: string): {
    score: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 0;
    const normalizedPath = path.normalize(filePath);

    // Check against critical paths
    for (const criticalPath of this.CRITICAL_PATHS) {
      if (normalizedPath.startsWith(criticalPath)) {
        score += 50;
        factors.push(`Critical system path: ${criticalPath}`);
        break;
      }
    }

    // Check against sensitive paths
    for (const sensitivePath of this.SENSITIVE_PATHS) {
      if (normalizedPath.startsWith(sensitivePath)) {
        score += 30;
        factors.push(`Sensitive path: ${sensitivePath}`);
        break;
      }
    }

    // Check for hidden files
    if (path.basename(normalizedPath).startsWith('.')) {
      score += 10;
      factors.push('Hidden file or directory');
    }

    // Check for configuration files
    if (/\.(conf|config|cfg|ini|env|json|yaml|yml|toml)$/i.test(normalizedPath)) {
      score += 15;
      factors.push('Configuration file');
    }

    // Check for credential files
    if (/\.(pem|key|crt|cer|pfx|p12|jks|keystore)$/i.test(normalizedPath)) {
      score += 40;
      factors.push('Credential or certificate file');
    }

    // Check for source control
    if (normalizedPath.includes('/.git/')) {
      score += 25;
      factors.push('Git repository file');
    }

    // Check for backup files
    if (/\.(bak|backup|old|orig|~)$/i.test(normalizedPath)) {
      score += 5;
      factors.push('Backup file');
    }

    return { score, factors };
  }

  /**
   * Assess risk based on operation type
   */
  private static assessOperationRisk(tool: string, operation: string): {
    score: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 0;

    const key = `${tool}_${operation}`;
    const dangerousOp = this.DANGEROUS_OPERATIONS[key as keyof typeof this.DANGEROUS_OPERATIONS];

    if (dangerousOp) {
      if (dangerousOp.base === 'high') {
        score += 30;
        factors.push(`High-risk operation: ${key}`);
      } else if (dangerousOp.base === 'medium') {
        score += 15;
        factors.push(`Medium-risk operation: ${key}`);
      }
    }

    // Special cases
    switch (tool) {
      case 'fs':
        if (operation === 'delete' || operation === 'unlink') {
          score += 25;
          factors.push('File deletion operation');
        } else if (operation === 'write' || operation === 'append') {
          score += 10;
          factors.push('File modification operation');
        } else if (operation === 'chmod' || operation === 'chown') {
          score += 20;
          factors.push('Permission modification operation');
        }
        break;

      case 'exec':
        score += 20;
        factors.push('Command execution');
        if (operation === 'spawn' || operation === 'fork') {
          score += 10;
          factors.push('Process spawning');
        }
        break;

      case 'network':
      case 'http':
        if (operation === 'request' || operation === 'fetch') {
          score += 10;
          factors.push('Network request');
        }
        if (operation === 'listen' || operation === 'serve') {
          score += 15;
          factors.push('Network server');
        }
        break;

      case 'database':
        if (operation === 'query' || operation === 'execute') {
          score += 15;
          factors.push('Database operation');
        }
        if (operation === 'migrate' || operation === 'schema') {
          score += 25;
          factors.push('Schema modification');
        }
        break;
    }

    return { score, factors };
  }

  /**
   * Assess risk based on command content
   */
  private static assessCommandRisk(command: string): {
    score: number;
    factors: string[];
  } {
    const factors: string[] = [];
    let score = 0;

    // Check against dangerous patterns
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        score += 40;
        factors.push(`Dangerous command pattern: ${pattern.source}`);
      }
    }

    // Check for sudo/admin commands
    if (/\b(sudo|su|runas|admin)\b/i.test(command)) {
      score += 30;
      factors.push('Elevated privilege command');
    }

    // Check for pipe to shell
    if (/\|\s*(sh|bash|zsh|fish|cmd|powershell)/i.test(command)) {
      score += 35;
      factors.push('Pipe to shell interpreter');
    }

    // Check for wildcard deletion
    if (/rm.*\*/i.test(command) || /del.*\*/i.test(command)) {
      score += 25;
      factors.push('Wildcard deletion');
    }

    // Check for recursive operations
    if (/-r\b|-R\b|--recursive\b|\/s\b/i.test(command)) {
      score += 15;
      factors.push('Recursive command flag');
    }

    // Check for force flags
    if (/-f\b|--force\b|\/f\b/i.test(command)) {
      score += 10;
      factors.push('Force flag');
    }

    return { score, factors };
  }

  /**
   * Convert risk score to risk level
   */
  private static scoreToRiskLevel(score: number): RiskLevel {
    if (score >= 80) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  /**
   * Get risk level color for terminal display
   */
  static getRiskColor(level: RiskLevel): string {
    switch (level) {
      case 'critical':
        return '\x1b[91m'; // Bright red
      case 'high':
        return '\x1b[31m'; // Red
      case 'medium':
        return '\x1b[33m'; // Yellow
      case 'low':
        return '\x1b[32m'; // Green
      default:
        return '\x1b[0m'; // Reset
    }
  }

  /**
   * Get risk level emoji for UI display
   */
  static getRiskEmoji(level: RiskLevel): string {
    switch (level) {
      case 'critical':
        return '🚨';
      case 'high':
        return '⚠️';
      case 'medium':
        return '⚡';
      case 'low':
        return '✓';
      default:
        return '❓';
    }
  }

  /**
   * Format risk assessment for display
   */
  static formatAssessment(assessment: {
    level: RiskLevel;
    score: number;
    factors: string[];
  }): string {
    const color = this.getRiskColor(assessment.level);
    const emoji = this.getRiskEmoji(assessment.level);
    const reset = '\x1b[0m';

    let output = `${color}${emoji} Risk Level: ${assessment.level.toUpperCase()} (Score: ${assessment.score})${reset}\n`;
    
    if (assessment.factors.length > 0) {
      output += 'Risk Factors:\n';
      assessment.factors.forEach(factor => {
        output += `  • ${factor}\n`;
      });
    }

    return output;
  }

  /**
   * Check if operation should be auto-denied based on risk
   */
  static shouldAutoDeny(assessment: {
    level: RiskLevel;
    score: number;
    factors: string[];
  }): boolean {
    // Auto-deny critical operations with very high scores
    return assessment.level === 'critical' && assessment.score >= 100;
  }

  /**
   * Check if operation requires additional confirmation
   */
  static requiresConfirmation(assessment: {
    level: RiskLevel;
    score: number;
    factors: string[];
  }): boolean {
    // Require confirmation for anything above low risk
    return assessment.level !== 'low';
  }

  /**
   * Get recommended action based on risk assessment
   */
  static getRecommendedAction(assessment: {
    level: RiskLevel;
    score: number;
    factors: string[];
  }): 'allow' | 'prompt' | 'deny' {
    if (assessment.score >= 100) return 'deny';
    if (assessment.score >= 25) return 'prompt';
    return 'allow';
  }
}