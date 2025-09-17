/**
 * Productivity Enhancement System
 * Provides intelligent productivity features including command history, aliases, shortcuts, and automation
 */

import { EventEmitter } from 'events';

export interface ProductivityConfig {
  enableSmartHistory: boolean;
  enableAutoAliases: boolean;
  enableWorkflowRecording: boolean;
  enableProductivityInsights: boolean;
  historyRetentionDays: number;
  maxAliases: number;
  workflowTimeout: number;
}

export interface CommandHistoryItem {
  id: string;
  command: string;
  args: string[];
  timestamp: Date;
  duration: number;
  success: boolean;
  context: CommandContext;
  userId: string;
  sessionId: string;
}

export interface CommandContext {
  workingDirectory: string;
  environment: Record<string, string>;
  projectType?: string;
  gitBranch?: string;
  previousCommand?: string;
  userIntent?: string;
}

export interface SmartAlias {
  id: string;
  alias: string;
  command: string;
  description: string;
  frequency: number;
  lastUsed: Date;
  createdBy: 'user' | 'system' | 'ai';
  category: string;
  tags: string[];
  isActive: boolean;
}

export interface WorkflowMacro {
  id: string;
  name: string;
  description: string;
  commands: WorkflowStep[];
  createdAt: Date;
  lastUsed: Date;
  frequency: number;
  estimatedTime: number;
  tags: string[];
  category: string;
  isTemplate: boolean;
}

export interface WorkflowStep {
  command: string;
  args: string[];
  description: string;
  optional: boolean;
  timeout?: number;
  retryCount?: number;
  condition?: string;
  expectedOutput?: string;
}

export interface ProductivityMetrics {
  commandsPerHour: number;
  averageCommandTime: number;
  mostUsedCommands: CommandUsageStats[];
  timeDistribution: Record<string, number>;
  efficiencyScore: number;
  automationOpportunities: AutomationOpportunity[];
  productivityTrend: TrendData[];
}

export interface CommandUsageStats {
  command: string;
  count: number;
  averageTime: number;
  successRate: number;
  lastUsed: Date;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface AutomationOpportunity {
  type: 'alias' | 'workflow' | 'shortcut';
  description: string;
  pattern: string;
  frequency: number;
  estimatedTimeSaving: number;
  confidence: number;
  suggestedAction: string;
}

export interface TrendData {
  date: Date;
  value: number;
  metric: string;
}

export interface CustomShortcut {
  id: string;
  trigger: string;
  action: string;
  description: string;
  category: string;
  isActive: boolean;
  createdAt: Date;
  modifiedAt: Date;
}

export interface ProductivityInsight {
  type: 'efficiency' | 'automation' | 'learning' | 'optimization';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  recommendation: string;
  data: Record<string, any>;
}

export interface HistorySearchOptions {
  query?: string;
  startDate?: Date;
  endDate?: Date;
  success?: boolean;
  minDuration?: number;
  maxDuration?: number;
  context?: Partial<CommandContext>;
  limit?: number;
  fuzzyMatch?: boolean;
}

export class ProductivityEnhancementEngine extends EventEmitter {
  private config: ProductivityConfig;
  private commandHistory: Map<string, CommandHistoryItem> = new Map();
  private aliases: Map<string, SmartAlias> = new Map();
  private workflows: Map<string, WorkflowMacro> = new Map();
  private shortcuts: Map<string, CustomShortcut> = new Map();
  private recordingSession: WorkflowRecordingSession | null = null;

  constructor(config: ProductivityConfig) {
    super();
    this.config = config;
    this.initializeProductivityFeatures();
  }

  /**
   * Record command execution in smart history
   */
  async recordCommandExecution(
    command: string,
    args: string[],
    duration: number,
    success: boolean,
    context: CommandContext,
    userId: string,
    sessionId: string
  ): Promise<void> {
    const historyItem: CommandHistoryItem = {
      id: this.generateId(),
      command,
      args,
      timestamp: new Date(),
      duration,
      success,
      context,
      userId,
      sessionId,
    };

    this.commandHistory.set(historyItem.id, historyItem);

    // Emit event for real-time processing
    this.emit('command-recorded', historyItem);

    // Analyze for automation opportunities
    await this.analyzeForAutomationOpportunities(historyItem);

    // Clean old history if needed
    await this.cleanupOldHistory();
  }

  /**
   * Search command history with intelligent filtering
   */
  async searchHistory(options: HistorySearchOptions): Promise<CommandHistoryItem[]> {
    let results = Array.from(this.commandHistory.values());

    // Apply filters
    if (options.query) {
      if (options.fuzzyMatch) {
        results = results.filter(item => 
          this.fuzzyMatch(item.command, options.query!) ||
          item.args.some(arg => this.fuzzyMatch(arg, options.query!))
        );
      } else {
        const query = options.query.toLowerCase();
        results = results.filter(item => 
          item.command.toLowerCase().includes(query) ||
          item.args.some(arg => arg.toLowerCase().includes(query))
        );
      }
    }

    if (options.startDate) {
      results = results.filter(item => item.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      results = results.filter(item => item.timestamp <= options.endDate!);
    }

    if (options.success !== undefined) {
      results = results.filter(item => item.success === options.success);
    }

    if (options.minDuration) {
      results = results.filter(item => item.duration >= options.minDuration!);
    }

    if (options.maxDuration) {
      results = results.filter(item => item.duration <= options.maxDuration!);
    }

    if (options.context) {
      results = results.filter(item => this.matchesContext(item.context, options.context!));
    }

    // Sort by timestamp (most recent first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Create and manage smart aliases
   */
  async createAlias(alias: string, command: string, description: string, category: string = 'user'): Promise<SmartAlias> {
    const aliasObj: SmartAlias = {
      id: this.generateId(),
      alias,
      command,
      description,
      frequency: 0,
      lastUsed: new Date(),
      createdBy: 'user',
      category,
      tags: [],
      isActive: true,
    };

    this.aliases.set(alias, aliasObj);
    this.emit('alias-created', aliasObj);
    
    return aliasObj;
  }

  /**
   * Get suggested aliases based on usage patterns
   */
  async getSuggestedAliases(userId: string): Promise<SmartAlias[]> {
    const suggestions: SmartAlias[] = [];
    const userCommands = Array.from(this.commandHistory.values())
      .filter(item => item.userId === userId);

    // Analyze frequently used long commands
    const commandFrequency = new Map<string, number>();
    for (const item of userCommands) {
      const fullCommand = `${item.command} ${item.args.join(' ')}`;
      if (fullCommand.length > 15) { // Only suggest aliases for longer commands
        commandFrequency.set(fullCommand, (commandFrequency.get(fullCommand) || 0) + 1);
      }
    }

    // Create suggestions for frequently used commands
    for (const [command, frequency] of commandFrequency) {
      if (frequency >= 3) { // Used at least 3 times
        const suggestedAlias = this.generateSuggestedAlias(command);
        suggestions.push({
          id: this.generateId(),
          alias: suggestedAlias,
          command,
          description: `Auto-suggested alias for frequently used command`,
          frequency,
          lastUsed: new Date(),
          createdBy: 'ai',
          category: 'suggested',
          tags: ['auto-generated', 'frequency-based'],
          isActive: false, // User needs to activate
        });
      }
    }

    return suggestions;
  }

  /**
   * Start recording a workflow macro
   */
  async startWorkflowRecording(name: string, description: string): Promise<string> {
    const sessionId = this.generateId();
    this.recordingSession = {
      id: sessionId,
      name,
      description,
      startTime: new Date(),
      commands: [],
      isActive: true,
    };

    this.emit('workflow-recording-started', this.recordingSession);
    return sessionId;
  }

  /**
   * Stop workflow recording and create macro
   */
  async stopWorkflowRecording(): Promise<WorkflowMacro | null> {
    if (!this.recordingSession || !this.recordingSession.isActive) {
      return null;
    }

    const session = this.recordingSession;
    session.isActive = false;

    const workflow: WorkflowMacro = {
      id: session.id,
      name: session.name,
      description: session.description,
      commands: session.commands,
      createdAt: session.startTime,
      lastUsed: new Date(),
      frequency: 0,
      estimatedTime: this.calculateWorkflowTime(session.commands),
      tags: ['recorded'],
      category: 'workflow',
      isTemplate: false,
    };

    this.workflows.set(workflow.id, workflow);
    this.recordingSession = null;
    
    this.emit('workflow-created', workflow);
    return workflow;
  }

  /**
   * Execute a workflow macro
   */
  async executeWorkflow(workflowId: string, context: CommandContext): Promise<WorkflowExecutionResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const result: WorkflowExecutionResult = {
      workflowId,
      startTime: new Date(),
      steps: [],
      success: true,
      totalDuration: 0,
    };

    try {
      for (let i = 0; i < workflow.commands.length; i++) {
        const step = workflow.commands[i];
        const stepResult = await this.executeWorkflowStep(step, context);
        
        result.steps.push(stepResult);
        result.totalDuration += stepResult.duration;

        if (!stepResult.success && !step.optional) {
          result.success = false;
          break;
        }
      }
    } catch (error) {
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);
    }

    result.endTime = new Date();
    
    // Update workflow usage statistics
    workflow.lastUsed = new Date();
    workflow.frequency++;

    this.emit('workflow-executed', result);
    return result;
  }

  /**
   * Get productivity metrics and insights
   */
  async getProductivityMetrics(userId: string, timeRange?: { start: Date; end: Date }): Promise<ProductivityMetrics> {
    const userCommands = this.getUserCommands(userId, timeRange);
    
    const metrics: ProductivityMetrics = {
      commandsPerHour: this.calculateCommandsPerHour(userCommands),
      averageCommandTime: this.calculateAverageCommandTime(userCommands),
      mostUsedCommands: this.getMostUsedCommands(userCommands),
      timeDistribution: this.getTimeDistribution(userCommands),
      efficiencyScore: await this.calculateEfficiencyScore(userCommands),
      automationOpportunities: await this.findAutomationOpportunities(userCommands),
      productivityTrend: await this.getProductivityTrend(userId, timeRange),
    };

    return metrics;
  }

  /**
   * Get personalized productivity insights
   */
  async getProductivityInsights(userId: string): Promise<ProductivityInsight[]> {
    const insights: ProductivityInsight[] = [];
    const metrics = await this.getProductivityMetrics(userId);

    // Efficiency insights
    if (metrics.efficiencyScore < 0.7) {
      insights.push({
        type: 'efficiency',
        title: 'Efficiency Improvement Opportunity',
        description: `Your command efficiency score is ${(metrics.efficiencyScore * 100).toFixed(1)}%`,
        impact: 'medium',
        effort: 'low',
        recommendation: 'Consider using aliases for frequently typed commands',
        data: { currentScore: metrics.efficiencyScore, targetScore: 0.8 },
      });
    }

    // Automation insights
    if (metrics.automationOpportunities.length > 0) {
      const highValueOpportunities = metrics.automationOpportunities
        .filter(opp => opp.estimatedTimeSaving > 60); // More than 1 minute savings
      
      if (highValueOpportunities.length > 0) {
        insights.push({
          type: 'automation',
          title: 'High-Value Automation Opportunities',
          description: `Found ${highValueOpportunities.length} automation opportunities that could save significant time`,
          impact: 'high',
          effort: 'medium',
          recommendation: 'Create workflows or aliases for the most frequent patterns',
          data: { opportunities: highValueOpportunities },
        });
      }
    }

    // Learning insights
    const underutilizedCommands = await this.findUnderutilizedCommands(userId);
    if (underutilizedCommands.length > 0) {
      insights.push({
        type: 'learning',
        title: 'Expand Your Command Knowledge',
        description: `There are ${underutilizedCommands.length} useful commands you haven't tried yet`,
        impact: 'medium',
        effort: 'low',
        recommendation: 'Explore these commands to enhance your productivity',
        data: { commands: underutilizedCommands },
      });
    }

    return insights;
  }

  /**
   * Manage custom shortcuts
   */
  async createShortcut(trigger: string, action: string, description: string, category: string = 'user'): Promise<CustomShortcut> {
    const shortcut: CustomShortcut = {
      id: this.generateId(),
      trigger,
      action,
      description,
      category,
      isActive: true,
      createdAt: new Date(),
      modifiedAt: new Date(),
    };

    this.shortcuts.set(trigger, shortcut);
    this.emit('shortcut-created', shortcut);
    
    return shortcut;
  }

  /**
   * Get active shortcuts for current context
   */
  async getActiveShortcuts(context?: CommandContext): Promise<CustomShortcut[]> {
    const shortcuts = Array.from(this.shortcuts.values())
      .filter(shortcut => shortcut.isActive);

    // Could add context-based filtering here
    return shortcuts;
  }

  private async initializeProductivityFeatures(): Promise<void> {
    // Set up periodic cleanup
    setInterval(() => {
      this.cleanupOldHistory();
    }, 24 * 60 * 60 * 1000); // Daily cleanup

    // Set up auto-alias generation
    if (this.config.enableAutoAliases) {
      setInterval(() => {
        this.generateAutoAliases();
      }, 7 * 24 * 60 * 60 * 1000); // Weekly analysis
    }
  }

  private async analyzeForAutomationOpportunities(historyItem: CommandHistoryItem): Promise<void> {
    // Add to recording session if active
    if (this.recordingSession && this.recordingSession.isActive) {
      this.recordingSession.commands.push({
        command: historyItem.command,
        args: historyItem.args,
        description: `${historyItem.command} ${historyItem.args.join(' ')}`,
        optional: false,
        timeout: Math.max(historyItem.duration * 2, 30000), // 2x duration or 30s minimum
      });
    }

    // Analyze for patterns that could be automated
    // Implementation would look for repeated command sequences
  }

  private async cleanupOldHistory(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.historyRetentionDays);

    const itemsToDelete: string[] = [];
    for (const [id, item] of this.commandHistory) {
      if (item.timestamp < cutoffDate) {
        itemsToDelete.push(id);
      }
    }

    for (const id of itemsToDelete) {
      this.commandHistory.delete(id);
    }

    if (itemsToDelete.length > 0) {
      this.emit('history-cleaned', { deletedCount: itemsToDelete.length });
    }
  }

  private fuzzyMatch(str1: string, str2: string): boolean {
    // Simple fuzzy matching implementation
    const threshold = 0.7;
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return true;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length >= threshold;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private matchesContext(itemContext: CommandContext, filterContext: Partial<CommandContext>): boolean {
    for (const [key, value] of Object.entries(filterContext)) {
      if (itemContext[key as keyof CommandContext] !== value) {
        return false;
      }
    }
    return true;
  }

  private generateSuggestedAlias(command: string): string {
    // Simple alias generation - take first letters of words
    const words = command.split(' ').filter(word => word.length > 0);
    let alias = '';
    
    for (const word of words) {
      if (word.startsWith('-')) {
        // Skip flags for now
        continue;
      }
      alias += word.charAt(0).toLowerCase();
    }
    
    return alias || 'cmd';
  }

  private calculateWorkflowTime(commands: WorkflowStep[]): number {
    return commands.reduce((total, step) => {
      return total + (step.timeout || 10000); // Default 10s per step
    }, 0);
  }

  private async executeWorkflowStep(step: WorkflowStep, context: CommandContext): Promise<WorkflowStepResult> {
    const startTime = Date.now();
    
    // This would be implemented to actually execute the command
    // For now, return a mock result
    const duration = Math.random() * 1000 + 500; // 500-1500ms
    const success = Math.random() > 0.1; // 90% success rate
    
    return {
      command: step.command,
      args: step.args,
      success,
      duration,
      output: success ? 'Command executed successfully' : 'Command failed',
    };
  }

  private getUserCommands(userId: string, timeRange?: { start: Date; end: Date }): CommandHistoryItem[] {
    let commands = Array.from(this.commandHistory.values())
      .filter(item => item.userId === userId);

    if (timeRange) {
      commands = commands.filter(item => 
        item.timestamp >= timeRange.start && item.timestamp <= timeRange.end
      );
    }

    return commands;
  }

  private calculateCommandsPerHour(commands: CommandHistoryItem[]): number {
    if (commands.length === 0) return 0;
    
    const timeSpan = commands[0].timestamp.getTime() - commands[commands.length - 1].timestamp.getTime();
    const hours = timeSpan / (1000 * 60 * 60);
    
    return hours > 0 ? commands.length / hours : 0;
  }

  private calculateAverageCommandTime(commands: CommandHistoryItem[]): number {
    if (commands.length === 0) return 0;
    
    const totalTime = commands.reduce((sum, cmd) => sum + cmd.duration, 0);
    return totalTime / commands.length;
  }

  private getMostUsedCommands(commands: CommandHistoryItem[]): CommandUsageStats[] {
    const usage = new Map<string, { count: number; totalTime: number; successes: number; lastUsed: Date }>();
    
    for (const cmd of commands) {
      const key = cmd.command;
      const current = usage.get(key) || { count: 0, totalTime: 0, successes: 0, lastUsed: new Date(0) };
      
      current.count++;
      current.totalTime += cmd.duration;
      if (cmd.success) current.successes++;
      if (cmd.timestamp > current.lastUsed) current.lastUsed = cmd.timestamp;
      
      usage.set(key, current);
    }
    
    return Array.from(usage.entries())
      .map(([command, stats]) => ({
        command,
        count: stats.count,
        averageTime: stats.totalTime / stats.count,
        successRate: stats.successes / stats.count,
        lastUsed: stats.lastUsed,
        trend: 'stable' as const, // Would be calculated based on recent usage
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private getTimeDistribution(commands: CommandHistoryItem[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const cmd of commands) {
      const hour = cmd.timestamp.getHours();
      const key = `${hour}:00`;
      distribution[key] = (distribution[key] || 0) + 1;
    }
    
    return distribution;
  }

  private async calculateEfficiencyScore(commands: CommandHistoryItem[]): Promise<number> {
    if (commands.length === 0) return 1;
    
    const successRate = commands.filter(cmd => cmd.success).length / commands.length;
    const avgTime = this.calculateAverageCommandTime(commands);
    const expectedTime = 2000; // 2 seconds expected average
    const timeEfficiency = Math.min(expectedTime / avgTime, 1);
    
    return (successRate + timeEfficiency) / 2;
  }

  private async findAutomationOpportunities(commands: CommandHistoryItem[]): Promise<AutomationOpportunity[]> {
    const opportunities: AutomationOpportunity[] = [];
    
    // Find repeated command sequences
    const sequences = this.findRepeatedSequences(commands);
    
    for (const sequence of sequences) {
      if (sequence.frequency >= 3 && sequence.commands.length > 1) {
        opportunities.push({
          type: 'workflow',
          description: `Repeated sequence: ${sequence.commands.join(' → ')}`,
          pattern: sequence.commands.join(' | '),
          frequency: sequence.frequency,
          estimatedTimeSaving: sequence.avgTime * sequence.frequency * 0.7, // 70% time saving
          confidence: Math.min(sequence.frequency / 10, 1),
          suggestedAction: `Create workflow macro for this sequence`,
        });
      }
    }
    
    return opportunities;
  }

  private findRepeatedSequences(commands: CommandHistoryItem[]): any[] {
    // Implementation would analyze command sequences to find patterns
    return [];
  }

  private async getProductivityTrend(userId: string, timeRange?: { start: Date; end: Date }): Promise<TrendData[]> {
    // Implementation would calculate productivity trends over time
    return [];
  }

  private async findUnderutilizedCommands(userId: string): Promise<string[]> {
    // Implementation would find commands user hasn't tried that might be useful
    return [];
  }

  private async generateAutoAliases(): Promise<void> {
    // Implementation would automatically generate and suggest aliases
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

// Supporting interfaces
interface WorkflowRecordingSession {
  id: string;
  name: string;
  description: string;
  startTime: Date;
  commands: WorkflowStep[];
  isActive: boolean;
}

interface WorkflowExecutionResult {
  workflowId: string;
  startTime: Date;
  endTime?: Date;
  steps: WorkflowStepResult[];
  success: boolean;
  totalDuration: number;
  error?: string;
}

interface WorkflowStepResult {
  command: string;
  args: string[];
  success: boolean;
  duration: number;
  output: string;
  error?: string;
}
