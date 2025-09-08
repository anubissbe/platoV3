import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import path from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import {
  AuditEntry,
  PermissionQuery,
  PermissionResult,
  PermissionAction,
  AuditSearchCriteria,
  LogFormatOptions,
  LogFormatter
} from './types';
import { createLogFormatter, createAuditContext, createAuditMetadata } from './LogFormatter';
import { AuditIndexer } from './AuditIndexer';
import { RetentionPolicy } from './RetentionPolicy';

export interface AuditLoggerOptions {
  logDirectory?: string;
  maxFileSize?: number; // bytes
  maxArchiveFiles?: number;
  retentionDays?: number;
  compressionEnabled?: boolean;
  enableIndexing?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  formatOptions?: LogFormatOptions;
  enableStructuredContext?: boolean;
  enablePerformanceMetrics?: boolean;
  enableRiskAssessment?: boolean;
  enableRetentionPolicies?: boolean;
  retentionPolicyOptions?: any; // From RetentionPolicy
}


export interface AuditStatistics {
  totalEntries: number;
  logFiles: number;
  totalSize: number;
  oldestEntry?: Date;
  newestEntry?: Date;
  actionCounts: Record<PermissionAction, number>;
  toolCounts: Record<string, number>;
}

export class AuditLogger extends EventEmitter {
  private options: Required<AuditLoggerOptions>;
  private currentLogFile: string = '';
  private writeStream?: NodeJS.WritableStream;
  private indexCache: Map<string, any[]> = new Map();
  private rotationLock: boolean = false;
  private formatter: LogFormatter;
  private indexer: AuditIndexer;
  private retentionPolicy: RetentionPolicy;
  private entryPosition: number = 0; // Track position for indexing

  constructor(options: AuditLoggerOptions = {}) {
    super();
    
    this.options = {
      logDirectory: options.logDirectory || path.join(process.cwd(), '.plato', 'audit-logs'),
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB default
      maxArchiveFiles: options.maxArchiveFiles || 100,
      retentionDays: options.retentionDays || 90, // 90 days default
      compressionEnabled: options.compressionEnabled || true,
      enableIndexing: options.enableIndexing || true,
      logLevel: options.logLevel || 'info',
      formatOptions: options.formatOptions || { format: 'json', include_context: true, include_metadata: true },
      enableStructuredContext: options.enableStructuredContext !== false,
      enablePerformanceMetrics: options.enablePerformanceMetrics !== false,
      enableRiskAssessment: options.enableRiskAssessment !== false,
      enableRetentionPolicies: options.enableRetentionPolicies !== false,
      retentionPolicyOptions: options.retentionPolicyOptions || {}
    };

    this.formatter = createLogFormatter(this.options.formatOptions);
    this.indexer = new AuditIndexer({
      indexDirectory: path.join(this.options.logDirectory, '..', 'audit-indexes'),
      enableInMemoryCache: this.options.enableIndexing,
      enablePerformanceTracking: true
    });

    this.retentionPolicy = new RetentionPolicy({
      ...this.options.retentionPolicyOptions,
      archiveDirectory: path.join(this.options.logDirectory, '..', 'audit-archive')
    });
  }

  /**
   * Initialize the audit logger
   */
  async initialize(): Promise<void> {
    try {
      // Create log directory
      await fs.mkdir(this.options.logDirectory, { recursive: true });
      
      // Initialize indexer
      await this.indexer.initialize();
      
      // Initialize retention policy
      if (this.options.enableRetentionPolicies) {
        await this.retentionPolicy.initialize();
      }
      
      // Initialize current log file
      await this.initializeCurrentLogFile();
      
      // Build search index if enabled
      if (this.options.enableIndexing) {
        await this.buildSearchIndex();
      }

      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Log a permission decision with enhanced context and metadata
   */
  async logPermissionDecision(
    query: PermissionQuery,
    result: PermissionResult,
    profile?: string,
    sessionId?: string,
    userDecision?: 'approved' | 'denied' | 'skipped',
    startTime?: number
  ): Promise<string> {
    const entryId = this.generateEntryId();
    const now = new Date();
    
    // Create base audit context
    const context = this.options.enableStructuredContext 
      ? this.enrichAuditContext(await this.createContextFromQuery(query))
      : createAuditContext();

    // Create metadata with performance metrics
    const metadata = createAuditMetadata(this.options.logLevel);
    
    if (this.options.enablePerformanceMetrics && startTime) {
      metadata.duration_ms = Date.now() - startTime;
    }

    if (this.options.enableRiskAssessment) {
      metadata.risk_score = this.calculateRiskScore(query, result);
    }

    // Add additional metadata
    metadata.category = this.categorizeEntry(query, result);
    metadata.tags = this.generateTags(query, result, profile);

    const entry: AuditEntry = {
      id: entryId,
      timestamp: now,
      query,
      result,
      profile,
      session_id: sessionId,
      user_decision: userDecision,
      context,
      metadata
    };

    await this.writeEntry(entry);
    
    // Update search index if enabled
    if (this.options.enableIndexing) {
      this.updateIndex(entry);
    }

    return entry.id;
  }

  /**
   * Search audit entries based on criteria using advanced indexing
   */
  async searchEntries(criteria: AuditSearchCriteria): Promise<AuditEntry[]> {
    if (!this.options.enableIndexing) {
      // Fallback to traditional file-based search
      return this.fallbackSearch(criteria);
    }

    try {
      // Use indexer for efficient search
      const indexResults = await this.indexer.search(criteria);
      
      // Convert index results to actual entries
      const entries: AuditEntry[] = [];
      for (const indexEntry of indexResults) {
        const entry = await this.indexer.getEntry(indexEntry);
        if (entry) {
          entries.push(entry);
        }
      }

      // Apply final filtering that couldn't be done at index level
      const filteredEntries = this.filterEntries(entries, criteria);
      
      return filteredEntries;
    } catch (error) {
      console.warn('Error using indexer, falling back to file search:', (error as Error).message);
      return this.fallbackSearch(criteria);
    }
  }

  /**
   * Fallback search method when indexing is not available
   */
  private async fallbackSearch(criteria: AuditSearchCriteria): Promise<AuditEntry[]> {
    const logFiles = await this.getLogFiles();
    let allEntries: AuditEntry[] = [];

    for (const logFile of logFiles) {
      try {
        const entries = await this.readLogFile(logFile);
        allEntries = allEntries.concat(entries);
      } catch (error) {
        // Handle malformed log files gracefully
        console.warn(`Error reading log file ${logFile}:`, (error as Error).message);
      }
    }

    // Apply search filters
    let filteredEntries = this.filterEntries(allEntries, criteria);

    // Apply pagination
    if (criteria.offset) {
      filteredEntries = filteredEntries.slice(criteria.offset);
    }
    if (criteria.limit) {
      filteredEntries = filteredEntries.slice(0, criteria.limit);
    }

    return filteredEntries;
  }

  /**
   * Get indexer statistics
   */
  getIndexerStats() {
    return this.indexer.getStats();
  }

  /**
   * Rebuild search indexes
   */
  async rebuildIndexes(): Promise<void> {
    return this.indexer.rebuildIndexes();
  }

  /**
   * Optimize search indexes
   */
  async optimizeIndexes(): Promise<void> {
    return this.indexer.optimize();
  }

  /**
   * Apply retention policies
   */
  async applyRetentionPolicies(): Promise<any> {
    if (!this.options.enableRetentionPolicies) {
      return { message: 'Retention policies are disabled' };
    }

    // Get all entries for retention policy evaluation
    const entries = await this.searchEntries({});
    return this.retentionPolicy.applyRetentionPolicies(entries, this.options.logDirectory);
  }

  /**
   * Get retention policy statistics
   */
  getRetentionStats() {
    return this.retentionPolicy.getStats();
  }

  /**
   * Add a retention rule
   */
  async addRetentionRule(rule: any): Promise<string> {
    return this.retentionPolicy.addRule(rule);
  }

  /**
   * Remove a retention rule
   */
  async removeRetentionRule(ruleId: string): Promise<boolean> {
    return this.retentionPolicy.removeRule(ruleId);
  }

  /**
   * Get all retention rules
   */
  getRetentionRules() {
    return this.retentionPolicy.getRules();
  }

  /**
   * Get audit statistics
   */
  async getStatistics(): Promise<AuditStatistics> {
    const logFiles = await this.getLogFiles();
    let totalEntries = 0;
    let totalSize = 0;
    let oldestEntry: Date | undefined;
    let newestEntry: Date | undefined;
    const actionCounts: Record<PermissionAction, number> = { allow: 0, deny: 0, confirm: 0 };
    const toolCounts: Record<string, number> = {};

    for (const logFile of logFiles) {
      try {
        const filePath = path.join(this.options.logDirectory, logFile);
        const stat = await fs.stat(filePath);
        totalSize += stat.size;

        const entries = await this.readLogFile(logFile);
        totalEntries += entries.length;

        for (const entry of entries) {
          // Update action counts
          actionCounts[entry.result.action]++;

          // Update tool counts
          const tool = entry.query.tool || 'unknown';
          toolCounts[tool] = (toolCounts[tool] || 0) + 1;

          // Update date range
          if (!oldestEntry || entry.timestamp < oldestEntry) {
            oldestEntry = entry.timestamp;
          }
          if (!newestEntry || entry.timestamp > newestEntry) {
            newestEntry = entry.timestamp;
          }
        }
      } catch (error) {
        console.warn(`Error processing log file ${logFile}:`, (error as Error).message);
      }
    }

    return {
      totalEntries,
      logFiles: logFiles.length,
      totalSize,
      oldestEntry,
      newestEntry,
      actionCounts,
      toolCounts
    };
  }

  /**
   * Enhanced cleanup with configurable retention policies
   */
  async cleanup(): Promise<void> {
    try {
      // Use retention policies if enabled
      if (this.options.enableRetentionPolicies) {
        const retentionStats = await this.applyRetentionPolicies();
        this.emit('cleanupCompleted', retentionStats);
        return;
      }

      // Fallback to traditional cleanup
      await this.traditionalCleanup();

    } catch (error) {
      this.emit('cleanupError', error);
    }
  }

  /**
   * Traditional cleanup method (fallback)
   */
  private async traditionalCleanup(): Promise<void> {
    const logFiles = await this.getLogFiles();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.options.retentionDays);

    const filesToDelete: string[] = [];
    const filesToKeep: string[] = [];

    for (const logFile of logFiles) {
      try {
        const filePath = path.join(this.options.logDirectory, logFile);
        const stat = await fs.stat(filePath);

        if (stat.mtime < cutoffDate) {
          filesToDelete.push(filePath);
        } else {
          filesToKeep.push(logFile);
        }
      } catch (error) {
        console.warn(`Error checking file ${logFile}:`, (error as Error).message);
      }
    }

    // Delete old files
    for (const filePath of filesToDelete) {
      try {
        await fs.unlink(filePath);
        console.debug(`Deleted old audit log: ${filePath}`);
      } catch (error) {
        console.warn(`Error deleting log file ${filePath}:`, (error as Error).message);
      }
    }

    // Enforce max archive files limit
    if (filesToKeep.length > this.options.maxArchiveFiles) {
      const sortedFiles = filesToKeep.sort();
      const extraFiles = sortedFiles.slice(0, filesToKeep.length - this.options.maxArchiveFiles);

      for (const fileName of extraFiles) {
        try {
          const filePath = path.join(this.options.logDirectory, fileName);
          await fs.unlink(filePath);
          console.debug(`Deleted excess audit log: ${filePath}`);
        } catch (error) {
          console.warn(`Error deleting excess log file ${fileName}:`, (error as Error).message);
        }
      }
    }

    this.emit('cleanupCompleted', {
      deletedFiles: filesToDelete.length,
      retainedFiles: filesToKeep.length
    });
  }

  /**
   * Destroy the audit logger and clean up resources
   */
  async destroy(): Promise<void> {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = undefined;
    }

    // Clean up indexer
    await this.indexer.destroy();

    // Clean up retention policy
    if (this.options.enableRetentionPolicies) {
      await this.retentionPolicy.destroy();
    }

    this.indexCache.clear();
    this.removeAllListeners();
  }

  /**
   * Create context from permission query
   */
  private async createContextFromQuery(query: PermissionQuery): Promise<import('./types').AuditContext> {
    const context = createAuditContext();
    
    // Add query-specific context
    if (query.path) {
      context.workspace_path = path.dirname(query.path);
    }

    // Try to get git context
    try {
      const { execa } = await import('execa');
      const { stdout: branch } = await execa('git', ['branch', '--show-current'], {
        cwd: context.workspace_path,
        timeout: 5000
      });
      
      const { stdout: commitHash } = await execa('git', ['rev-parse', 'HEAD'], {
        cwd: context.workspace_path,
        timeout: 5000
      });

      const { stdout: status } = await execa('git', ['status', '--porcelain'], {
        cwd: context.workspace_path,
        timeout: 5000
      });

      const { stdout: remote } = await execa('git', ['remote', 'get-url', 'origin'], {
        cwd: context.workspace_path,
        timeout: 5000
      }).catch(() => ({ stdout: '' }));

      context.git_context = {
        branch: branch.trim(),
        commit_hash: commitHash.trim(),
        repository: remote.trim(),
        is_clean: status.trim().length === 0
      };
    } catch (error) {
      // Git not available or not a git repository
    }

    return context;
  }

  /**
   * Enrich audit context with additional information
   */
  private enrichAuditContext(context: import('./types').AuditContext): import('./types').AuditContext {
    // Add correlation ID for request tracking
    context.correlation_id = this.generateEntryId();
    
    // Add request ID if available (could be set by upper layers)
    if (process.env.REQUEST_ID) {
      context.request_id = process.env.REQUEST_ID;
    }

    // Determine source based on environment
    if (process.env.CI) {
      context.source = 'system';
    } else if (process.env.HTTP_PORT || process.env.PORT) {
      context.source = 'api';
    } else {
      context.source = 'cli';
    }

    return context;
  }

  /**
   * Calculate risk score based on query and result
   */
  private calculateRiskScore(query: PermissionQuery, result: PermissionResult): number {
    let riskScore = 0;

    // Base risk by action
    switch (result.action) {
      case 'allow':
        riskScore += 10;
        break;
      case 'deny':
        riskScore += 30;
        break;
      case 'confirm':
        riskScore += 50;
        break;
    }

    // Risk by tool type
    const highRiskTools = ['fs', 'exec', 'shell', 'network', 'process'];
    if (highRiskTools.some(tool => query.tool.toLowerCase().includes(tool))) {
      riskScore += 20;
    }

    // Risk by operation type
    const highRiskOperations = ['delete', 'remove', 'write', 'execute', 'modify', 'chmod'];
    if (query.operation && highRiskOperations.some(op => query.operation!.toLowerCase().includes(op))) {
      riskScore += 15;
    }

    // Risk by path sensitivity
    if (query.path) {
      const sensitivePaths = ['/etc/', '/bin/', '/usr/', '/sys/', '/proc/', '~/', '.env', '.secret'];
      if (sensitivePaths.some(path => query.path!.includes(path))) {
        riskScore += 25;
      }
    }

    // Confidence penalty (lower confidence = higher risk)
    if (result.confidence < 0.5) {
      riskScore += 20;
    } else if (result.confidence < 0.8) {
      riskScore += 10;
    }

    return Math.min(riskScore, 100); // Cap at 100
  }

  /**
   * Categorize audit entry for better organization
   */
  private categorizeEntry(query: PermissionQuery, result: PermissionResult): 'permission' | 'security' | 'compliance' | 'performance' {
    // Security category
    if (result.action === 'deny' || this.calculateRiskScore(query, result) > 70) {
      return 'security';
    }

    // Performance category
    if (query.operation?.includes('performance') || query.tool.includes('perf')) {
      return 'performance';
    }

    // Compliance category
    if (result.rule?.reason?.toLowerCase().includes('compliance') || 
        result.rule?.reason?.toLowerCase().includes('policy')) {
      return 'compliance';
    }

    // Default to permission
    return 'permission';
  }

  /**
   * Generate tags for better filtering and search
   */
  private generateTags(query: PermissionQuery, result: PermissionResult, profile?: string): string[] {
    const tags: string[] = [];

    // Add tool-based tags
    tags.push(`tool:${query.tool}`);
    
    if (query.operation) {
      tags.push(`operation:${query.operation}`);
    }

    // Add result-based tags
    tags.push(`action:${result.action}`);
    
    if (result.confidence < 0.5) {
      tags.push('low-confidence');
    } else if (result.confidence > 0.9) {
      tags.push('high-confidence');
    }

    // Add profile tag
    if (profile) {
      tags.push(`profile:${profile}`);
    }

    // Add risk-based tags
    const riskScore = this.calculateRiskScore(query, result);
    if (riskScore > 70) {
      tags.push('high-risk');
    } else if (riskScore > 40) {
      tags.push('medium-risk');
    } else {
      tags.push('low-risk');
    }

    // Add path-based tags
    if (query.path) {
      const extension = path.extname(query.path);
      if (extension) {
        tags.push(`file-type:${extension.slice(1)}`);
      }
      
      if (query.path.includes('.git')) {
        tags.push('git-related');
      }
      
      if (query.path.includes('test')) {
        tags.push('test-related');
      }
    }

    return tags;
  }

  /**
   * Initialize the current log file
   */
  private async initializeCurrentLogFile(): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.currentLogFile = path.join(this.options.logDirectory, `audit-${timestamp}.log`);

    // Check if rotation is needed
    try {
      const stat = await fs.stat(this.currentLogFile);
      if (stat.size >= this.options.maxFileSize) {
        await this.rotateLogFile();
      }
    } catch (error) {
      // File doesn't exist, which is fine for a new log file
    }
  }

  /**
   * Write an audit entry to the current log file using the configured formatter
   */
  private async writeEntry(entry: AuditEntry): Promise<void> {
    // Check if rotation is needed before writing
    if (!this.rotationLock) {
      try {
        const stat = await fs.stat(this.currentLogFile);
        if (stat.size >= this.options.maxFileSize) {
          await this.rotateLogFile();
        }
      } catch (error) {
        // File doesn't exist yet
      }
    }

    // Get current file size for position tracking
    let currentPosition = 0;
    try {
      const stat = await fs.stat(this.currentLogFile);
      currentPosition = stat.size;
    } catch (error) {
      // File doesn't exist, position is 0
    }

    // Format and write the entry
    const formattedEntry = this.formatter.format(entry);
    const entryLine = formattedEntry + '\n';
    await fs.appendFile(this.currentLogFile, entryLine, 'utf8');
    
    // Add to indexer if indexing is enabled
    if (this.options.enableIndexing) {
      const fileName = path.basename(this.currentLogFile);
      await this.indexer.addEntry(entry, fileName, currentPosition);
    }
    
    this.emit('entryLogged', entry);
  }

  /**
   * Rotate the current log file
   */
  private async rotateLogFile(): Promise<void> {
    if (this.rotationLock) {
      return; // Another rotation is in progress
    }

    this.rotationLock = true;
    
    try {
      const timestamp = new Date().toISOString().replace(/[:]/g, '-');
      const rotatedFile = this.currentLogFile.replace('.log', `-${timestamp}.log`);

      // Move current log file to rotated name
      try {
        await fs.rename(this.currentLogFile, rotatedFile);
      } catch (error) {
        // Current file might not exist yet
      }

      // Compress the rotated file if enabled
      if (this.options.compressionEnabled) {
        await this.compressLogFile(rotatedFile);
      }

      // Initialize new current log file
      await this.initializeCurrentLogFile();
      
      this.emit('logRotated', { rotatedFile });

    } finally {
      this.rotationLock = false;
    }
  }

  /**
   * Compress a log file using gzip
   */
  private async compressLogFile(filePath: string): Promise<void> {
    try {
      const gzipPath = `${filePath}.gz`;
      const readable = createReadStream(filePath);
      const writable = createWriteStream(gzipPath);
      const gzip = createGzip();

      await pipeline(readable, gzip, writable);

      // Remove original file after successful compression
      await fs.unlink(filePath);
      
      console.debug(`Compressed log file: ${filePath} -> ${gzipPath}`);
    } catch (error) {
      console.warn(`Error compressing log file ${filePath}:`, (error as Error).message);
    }
  }

  /**
   * Get list of log files
   */
  private async getLogFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.options.logDirectory);
      return files.filter(file => 
        file.startsWith('audit-') && (file.endsWith('.log') || file.endsWith('.log.gz'))
      ).sort();
    } catch (error) {
      return [];
    }
  }

  /**
   * Read entries from a log file
   */
  private async readLogFile(fileName: string): Promise<AuditEntry[]> {
    const filePath = path.join(this.options.logDirectory, fileName);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const entries: AuditEntry[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          // Convert timestamp string back to Date object
          entry.timestamp = new Date(entry.timestamp);
          entry.result.timestamp = new Date(entry.result.timestamp);
          entries.push(entry);
        } catch (error) {
          console.warn(`Error parsing audit entry: ${line}`);
        }
      }
      
      return entries;
    } catch (error) {
      console.warn(`Error reading log file ${filePath}:`, (error as Error).message);
      return [];
    }
  }

  /**
   * Filter entries based on enhanced search criteria
   */
  private filterEntries(entries: AuditEntry[], criteria: AuditSearchCriteria): AuditEntry[] {
    let filtered = entries.filter(entry => {
      // Basic filters
      if (criteria.tool && entry.query.tool !== criteria.tool) {
        return false;
      }

      if (criteria.action && entry.result.action !== criteria.action) {
        return false;
      }

      if (criteria.profile && entry.profile !== criteria.profile) {
        return false;
      }

      if (criteria.sessionId && entry.session_id !== criteria.sessionId) {
        return false;
      }

      // Date range filter
      if (criteria.startDate && entry.timestamp < criteria.startDate) {
        return false;
      }

      if (criteria.endDate && entry.timestamp > criteria.endDate) {
        return false;
      }

      // Enhanced filters
      if (criteria.level && entry.metadata?.level !== criteria.level) {
        return false;
      }

      if (criteria.category && entry.metadata?.category !== criteria.category) {
        return false;
      }

      if (criteria.source && entry.context?.source !== criteria.source) {
        return false;
      }

      if (criteria.tags && criteria.tags.length > 0) {
        const entryTags = entry.metadata?.tags || [];
        const hasAllTags = criteria.tags.every(tag => entryTags.includes(tag));
        if (!hasAllTags) {
          return false;
        }
      }

      if (criteria.risk_score_min !== undefined && 
          (entry.metadata?.risk_score === undefined || entry.metadata.risk_score < criteria.risk_score_min)) {
        return false;
      }

      if (criteria.risk_score_max !== undefined && 
          (entry.metadata?.risk_score === undefined || entry.metadata.risk_score > criteria.risk_score_max)) {
        return false;
      }

      if (criteria.has_user_decision !== undefined) {
        const hasDecision = entry.user_decision !== undefined;
        if (hasDecision !== criteria.has_user_decision) {
          return false;
        }
      }

      if (criteria.cache_hit !== undefined && entry.metadata?.cache_hit !== criteria.cache_hit) {
        return false;
      }

      if (criteria.git_branch && entry.context?.git_context?.branch !== criteria.git_branch) {
        return false;
      }

      if (criteria.workspace_path && !entry.context?.workspace_path?.includes(criteria.workspace_path)) {
        return false;
      }

      return true;
    });

    // Apply sorting
    const sortBy = criteria.sort_by || 'timestamp';
    const sortOrder = criteria.sort_order || 'desc';

    filtered.sort((a, b) => {
      let aValue: number;
      let bValue: number;

      switch (sortBy) {
        case 'risk_score':
          aValue = a.metadata?.risk_score || 0;
          bValue = b.metadata?.risk_score || 0;
          break;
        case 'duration_ms':
          aValue = a.metadata?.duration_ms || 0;
          bValue = b.metadata?.duration_ms || 0;
          break;
        case 'timestamp':
        default:
          aValue = a.timestamp.getTime();
          bValue = b.timestamp.getTime();
          break;
      }

      return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
    });

    return filtered;
  }

  /**
   * Generate unique entry ID
   */
  private generateEntryId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Build search index for efficient querying
   */
  private async buildSearchIndex(): Promise<void> {
    if (!this.options.enableIndexing) {
      return;
    }

    try {
      const logFiles = await this.getLogFiles();
      
      for (const logFile of logFiles) {
        const entries = await this.readLogFile(logFile);
        this.indexCache.set(logFile, entries);
      }

      this.emit('indexBuilt', { files: logFiles.length });
    } catch (error) {
      console.warn('Error building search index:', (error as Error).message);
    }
  }

  /**
   * Update search index with new entry
   */
  private updateIndex(entry: AuditEntry): void {
    if (!this.options.enableIndexing) {
      return;
    }

    const currentLogFileName = path.basename(this.currentLogFile);
    const currentEntries = this.indexCache.get(currentLogFileName) || [];
    currentEntries.push(entry);
    this.indexCache.set(currentLogFileName, currentEntries);
  }
}