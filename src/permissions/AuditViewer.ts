import { AuditLogger } from './AuditLogger';
import { AuditEntry, AuditSearchCriteria, LogFormatOptions } from './types';
import { createLogFormatter } from './LogFormatter';

/**
 * Interactive audit log viewer for the `/permissions audit` command
 * Provides filtering, searching, and display functionality
 */

export interface ViewerOptions {
  pageSize?: number;
  defaultFormat?: 'json' | 'structured' | 'csv' | 'human-readable';
  enableInteractive?: boolean;
  maxDisplayEntries?: number;
}

export interface ViewCommand {
  action: 'list' | 'search' | 'stats' | 'export' | 'tail' | 'help';
  filters?: AuditSearchCriteria;
  options?: {
    format?: string;
    output?: string;
    limit?: number;
    follow?: boolean;
  };
}

export class AuditViewer {
  private auditLogger: AuditLogger;
  private options: Required<ViewerOptions>;

  constructor(auditLogger: AuditLogger, options: ViewerOptions = {}) {
    this.auditLogger = auditLogger;
    this.options = {
      pageSize: options.pageSize || 20,
      defaultFormat: options.defaultFormat || 'human-readable',
      enableInteractive: options.enableInteractive !== false,
      maxDisplayEntries: options.maxDisplayEntries || 1000
    };
  }

  /**
   * Process a permissions audit command
   */
  async processCommand(args: string[]): Promise<string> {
    if (args.length === 0) {
      return this.getHelpText();
    }

    const command = this.parseCommand(args);
    
    try {
      switch (command.action) {
        case 'list':
          return await this.listEntries(command.filters, command.options);
        
        case 'search':
          return await this.searchEntries(command.filters, command.options);
        
        case 'stats':
          return await this.showStatistics(command.options);
        
        case 'export':
          return await this.exportEntries(command.filters, command.options);
        
        case 'tail':
          return await this.tailEntries(command.options);
        
        case 'help':
        default:
          return this.getHelpText();
      }
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  }

  /**
   * Parse command line arguments into a ViewCommand
   */
  private parseCommand(args: string[]): ViewCommand {
    const command: ViewCommand = {
      action: 'list',
      filters: {},
      options: {}
    };

    // Parse action
    if (['list', 'search', 'stats', 'export', 'tail', 'help'].includes(args[0])) {
      command.action = args[0] as any;
      args = args.slice(1);
    }

    // Parse filters and options
    let i = 0;
    while (i < args.length) {
      const arg = args[i];
      const nextArg = args[i + 1];

      switch (arg) {
        case '--tool':
          if (nextArg) command.filters!.tool = nextArg;
          i += 2;
          break;
        
        case '--action':
          if (nextArg && ['allow', 'deny', 'confirm'].includes(nextArg)) {
            command.filters!.action = nextArg as any;
          }
          i += 2;
          break;
        
        case '--profile':
          if (nextArg) command.filters!.profile = nextArg;
          i += 2;
          break;
        
        case '--session':
          if (nextArg) command.filters!.sessionId = nextArg;
          i += 2;
          break;
        
        case '--level':
          if (nextArg && ['debug', 'info', 'warn', 'error'].includes(nextArg)) {
            command.filters!.level = nextArg as any;
          }
          i += 2;
          break;
        
        case '--category':
          if (nextArg && ['permission', 'security', 'compliance', 'performance'].includes(nextArg)) {
            command.filters!.category = nextArg as any;
          }
          i += 2;
          break;
        
        case '--source':
          if (nextArg && ['cli', 'api', 'ui', 'system'].includes(nextArg)) {
            command.filters!.source = nextArg as any;
          }
          i += 2;
          break;
        
        case '--branch':
          if (nextArg) command.filters!.git_branch = nextArg;
          i += 2;
          break;
        
        case '--risk-min':
          if (nextArg) command.filters!.risk_score_min = parseInt(nextArg);
          i += 2;
          break;
        
        case '--risk-max':
          if (nextArg) command.filters!.risk_score_max = parseInt(nextArg);
          i += 2;
          break;
        
        case '--since':
          if (nextArg) command.filters!.startDate = new Date(nextArg);
          i += 2;
          break;
        
        case '--until':
          if (nextArg) command.filters!.endDate = new Date(nextArg);
          i += 2;
          break;
        
        case '--limit':
          if (nextArg) {
            command.filters!.limit = parseInt(nextArg);
            command.options!.limit = parseInt(nextArg);
          }
          i += 2;
          break;
        
        case '--format':
          if (nextArg && ['json', 'structured', 'csv', 'human-readable'].includes(nextArg)) {
            command.options!.format = nextArg;
          }
          i += 2;
          break;
        
        case '--output':
          if (nextArg) command.options!.output = nextArg;
          i += 2;
          break;
        
        case '--follow':
          command.options!.follow = true;
          i += 1;
          break;
        
        default:
          // Skip unknown arguments
          i += 1;
          break;
      }
    }

    return command;
  }

  /**
   * List audit entries with optional filtering
   */
  private async listEntries(filters?: AuditSearchCriteria, options?: any): Promise<string> {
    const searchCriteria: AuditSearchCriteria = {
      ...filters,
      limit: options?.limit || this.options.pageSize,
      sort_by: 'timestamp',
      sort_order: 'desc'
    };

    const entries = await this.auditLogger.searchEntries(searchCriteria);
    
    if (entries.length === 0) {
      return 'No audit entries found matching the specified criteria.';
    }

    const format = options?.format || this.options.defaultFormat;
    const formatter = createLogFormatter({ 
      format: format as any,
      include_context: true,
      include_metadata: true
    });

    const output = formatter.formatBatch(entries);
    
    // Add summary
    const summary = `\n📊 Showing ${entries.length} entries (format: ${format})`;
    return output + summary;
  }

  /**
   * Search audit entries with enhanced filtering
   */
  private async searchEntries(filters?: AuditSearchCriteria, options?: any): Promise<string> {
    if (!filters || Object.keys(filters).length === 0) {
      return 'Please specify search criteria. Use `/permissions audit help` for available options.';
    }

    return this.listEntries(filters, options);
  }

  /**
   * Show audit statistics
   */
  private async showStatistics(options?: any): Promise<string> {
    const stats = await this.auditLogger.getStatistics();
    const indexerStats = this.auditLogger.getIndexerStats();
    const retentionStats = this.auditLogger.getRetentionStats();

    const output = [
      '📈 Audit Log Statistics',
      '═'.repeat(50),
      '',
      '📋 General Statistics:',
      `  Total Entries: ${stats.totalEntries.toLocaleString()}`,
      `  Log Files: ${stats.logFiles}`,
      `  Total Size: ${this.formatBytes(stats.totalSize)}`,
      `  Oldest Entry: ${stats.oldestEntry?.toLocaleString() || 'N/A'}`,
      `  Newest Entry: ${stats.newestEntry?.toLocaleString() || 'N/A'}`,
      '',
      '⚡ Action Breakdown:',
      `  Allow: ${stats.actionCounts.allow?.toLocaleString() || 0}`,
      `  Deny: ${stats.actionCounts.deny?.toLocaleString() || 0}`,
      `  Confirm: ${stats.actionCounts.confirm?.toLocaleString() || 0}`,
      '',
      '🔧 Top Tools:',
      ...Object.entries(stats.toolCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([tool, count]) => `  ${tool}: ${count.toLocaleString()}`),
      '',
      '🔍 Index Performance:',
      `  Total Entries: ${indexerStats.total_entries.toLocaleString()}`,
      `  Index Files: ${indexerStats.index_files}`,
      `  Index Size: ${this.formatBytes(indexerStats.index_size_bytes)}`,
      `  Avg Query Time: ${indexerStats.search_performance.average_query_time_ms.toFixed(2)}ms`,
      `  Cache Hit Ratio: ${(indexerStats.search_performance.cache_hit_ratio * 100).toFixed(1)}%`,
      '',
      '🧹 Retention Policy:',
      `  Entries Processed: ${retentionStats.entries_processed?.toLocaleString() || 0}`,
      `  Entries Deleted: ${retentionStats.entries_deleted?.toLocaleString() || 0}`,
      `  Entries Archived: ${retentionStats.entries_archived?.toLocaleString() || 0}`,
      `  Bytes Freed: ${this.formatBytes(retentionStats.bytes_freed || 0)}`,
      `  Last Cleanup: ${retentionStats.last_cleanup?.toLocaleString() || 'Never'}`,
      `  Next Cleanup: ${retentionStats.next_cleanup?.toLocaleString() || 'Not scheduled'}`
    ];

    return output.join('\n');
  }

  /**
   * Export audit entries to a file
   */
  private async exportEntries(filters?: AuditSearchCriteria, options?: any): Promise<string> {
    const outputFile = options?.output;
    if (!outputFile) {
      return 'Error: Please specify output file with --output filename';
    }

    const searchCriteria: AuditSearchCriteria = {
      ...filters,
      limit: this.options.maxDisplayEntries // Allow larger exports
    };

    const entries = await this.auditLogger.searchEntries(searchCriteria);
    
    if (entries.length === 0) {
      return 'No entries found to export.';
    }

    const format = options?.format || 'json';
    const formatter = createLogFormatter({ 
      format: format as any,
      include_context: true,
      include_metadata: true
    });

    const output = formatter.formatBatch(entries);

    // In a real implementation, this would write to a file
    // For now, return the content with a message
    return `Export completed: ${entries.length} entries in ${format} format\n` +
           `Would write to: ${outputFile}\n` +
           `Preview (first 500 characters):\n${output.substring(0, 500)}...`;
  }

  /**
   * Show recent entries (tail-like functionality)
   */
  private async tailEntries(options?: any): Promise<string> {
    const limit = options?.limit || 10;
    
    const entries = await this.auditLogger.searchEntries({
      limit,
      sort_by: 'timestamp',
      sort_order: 'desc'
    });

    if (entries.length === 0) {
      return 'No recent audit entries found.';
    }

    const format = this.options.defaultFormat;
    const formatter = createLogFormatter({ 
      format: format as any,
      include_context: false, // Less verbose for tail
      include_metadata: true
    });

    const output = formatter.formatBatch(entries);
    const summary = `\n📝 Last ${entries.length} audit entries`;
    
    return output + summary;
  }

  /**
   * Get help text for audit commands
   */
  private getHelpText(): string {
    return [
      '🛡️  Audit Log Viewer Commands',
      '═'.repeat(50),
      '',
      'Usage: /permissions audit [command] [options]',
      '',
      'Commands:',
      '  list              List recent audit entries (default)',
      '  search            Search with specific criteria',
      '  stats             Show audit statistics',
      '  export            Export entries to file',
      '  tail              Show most recent entries',
      '  help              Show this help message',
      '',
      'Filtering Options:',
      '  --tool TOOL       Filter by tool name',
      '  --action ACTION   Filter by action (allow|deny|confirm)',
      '  --profile PROFILE Filter by profile name',
      '  --session ID      Filter by session ID',
      '  --level LEVEL     Filter by log level (debug|info|warn|error)',
      '  --category CAT    Filter by category (permission|security|compliance|performance)',
      '  --source SOURCE   Filter by source (cli|api|ui|system)',
      '  --branch BRANCH   Filter by git branch',
      '  --risk-min NUM    Minimum risk score (0-100)',
      '  --risk-max NUM    Maximum risk score (0-100)',
      '  --since DATE      Start date (ISO format)',
      '  --until DATE      End date (ISO format)',
      '',
      'Display Options:',
      '  --format FORMAT   Output format (json|structured|csv|human-readable)',
      '  --limit NUM       Maximum number of entries to show',
      '  --output FILE     Export to file (export command only)',
      '',
      'Examples:',
      '  /permissions audit                           # List recent entries',
      '  /permissions audit stats                     # Show statistics',
      '  /permissions audit --tool fs --action deny   # Show denied filesystem operations',
      '  /permissions audit --risk-min 70             # Show high-risk entries',
      '  /permissions audit --since 2024-01-01       # Show entries since date',
      '  /permissions audit export --format csv --output audit.csv  # Export to CSV',
      '  /permissions audit tail --limit 5           # Show last 5 entries'
    ].join('\n');
  }

  /**
   * Format bytes for human-readable display
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}