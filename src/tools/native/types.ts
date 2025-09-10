/**
 * Types for Native Tool Implementation
 * Defines interfaces and types for Claude Code-compatible tool implementations
 */

import { EventEmitter } from 'events';

/**
 * Error classification for proper retry logic
 */
export enum ErrorClass {
  TRANSIENT = 'transient',    // Retryable errors
  PERMANENT = 'permanent',    // Non-retryable errors
  VALIDATION = 'validation',  // Input validation errors
  PERMISSION = 'permission',  // Access denied errors
  TIMEOUT = 'timeout',        // Execution timeout errors
}

/**
 * Structured tool error with retry information
 */
export class ToolError extends Error {
  constructor(
    public readonly errorClass: ErrorClass,
    public readonly code: string,
    message: string,
    public readonly details?: any,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'ToolError';
  }

  get retryable(): boolean {
    return this.errorClass === ErrorClass.TRANSIENT;
  }
}

/**
 * Base interface for all tool responses
 */
export interface BaseToolResponse {
  success: boolean;
  error?: ToolError;
  metrics?: ToolMetrics;
}

/**
 * Performance and usage metrics
 */
export interface ToolMetrics {
  duration: number;
  startTime: number;
  endTime: number;
  [key: string]: any;
}

/**
 * Streaming event types
 */
export interface ToolEvent {
  type: 'stdout' | 'stderr' | 'progress' | 'metadata' | 'error' | 'complete';
  data?: any;
  timestamp: number;
  sequence: number;
  bytesRead?: number;
  totalBytes?: number;
  progress?: number;
  success?: boolean;
}

/**
 * Tool call arguments interface
 */
export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

/**
 * Base interface for native tools
 */
export interface NativeTool extends EventEmitter {
  execute(args: Record<string, any>): Promise<BaseToolResponse>;
  stream?(args: Record<string, any>): AsyncGenerator<ToolEvent>;
  cancel?(executionId: string): Promise<void>;
}

// ============================================================================
// READ TOOL INTERFACES
// ============================================================================

export interface ReadToolArgs {
  path: string;
  encoding?: string;
  startLine?: number;
  endLine?: number;
  forceText?: boolean;
}

export interface ReadToolResponse extends BaseToolResponse {
  content?: string;
  encoding?: string;
  detectedEncoding?: string;
  size?: number;
  totalLines?: number;
  requestedRange?: { start: number; end: number };
  truncated?: boolean;
  isBinary?: boolean;
  outOfRange?: boolean;
  encodingFallback?: boolean;
  resolvedPath?: string;
  metrics?: ReadToolMetrics;
}

export interface ReadToolMetrics extends ToolMetrics {
  readTime: number;
  throughput: number;
  encoding: string;
  bytesRead?: number;
}

// ============================================================================
// WRITE TOOL INTERFACES
// ============================================================================

export interface WriteToolArgs {
  path: string;
  content: string;
  encoding?: string;
  atomic?: boolean;
  backup?: boolean;
  createDirs?: boolean;
  preservePermissions?: boolean;
  permissions?: number;
}

export interface WriteToolResponse extends BaseToolResponse {
  bytesWritten?: number;
  encoding?: string;
  overwritten?: boolean;
  atomic?: boolean;
  backupPath?: string;
  dirsCreated?: string[];
  tempPath?: string;
  isBinary?: boolean;
  metrics?: WriteToolMetrics;
}

export interface WriteToolMetrics extends ToolMetrics {
  writeTime: number;
  throughput: number;
  encoding: string;
  bytesWritten?: number;
}

// ============================================================================
// EDIT TOOL INTERFACES
// ============================================================================

export interface EditToolArgs {
  path: string;
  
  // Line-based editing
  lineNumber?: number;
  startLine?: number;
  endLine?: number;
  insertAfterLine?: number;
  delete?: boolean;
  
  // Pattern-based editing
  pattern?: string | RegExp | Buffer;
  replacement?: string | Buffer;
  regex?: boolean;
  replaceFirst?: boolean;
  replaceAll?: boolean;
  caseInsensitive?: boolean;
  multiline?: boolean;
  
  // Options
  atomic?: boolean;
  backup?: boolean;
  generateDiff?: boolean;
  contextLines?: number;
  detectConflicts?: boolean;
  binary?: boolean;
}

export interface EditToolResponse extends BaseToolResponse {
  changes?: number;
  linesModified?: number[];
  linesAdded?: number;
  linesDeleted?: number;
  matchCount?: number;
  diff?: string;
  backupPath?: string;
  metrics?: EditToolMetrics;
}

export interface EditToolMetrics extends ToolMetrics {
  patternMatches: number;
  bytesChanged: number;
  processingTime: number;
  diffGenerationTime?: number;
}

// ============================================================================
// LIST TOOL INTERFACES
// ============================================================================

export interface ListToolArgs {
  path?: string;
  recursive?: boolean;
  pattern?: string;
  glob?: string;
  includeHidden?: boolean;
  sortBy?: 'name' | 'size' | 'modified' | 'type';
  sortOrder?: 'asc' | 'desc';
  stats?: boolean;
  maxDepth?: number;
}

export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
  modified?: Date;
  created?: Date;
  permissions?: string;
  depth?: number;
}

export interface ListToolResponse extends BaseToolResponse {
  files?: FileInfo[];
  directories?: FileInfo[];
  totalFiles?: number;
  totalDirectories?: number;
  totalSize?: number;
  truncated?: boolean;
  resolvedPath?: string;
  metrics?: ListToolMetrics;
}

export interface ListToolMetrics extends ToolMetrics {
  itemsProcessed: number;
  throughput: number;
  filesScanned: number;
  directoriesScanned: number;
  filterTime: number;
  sortTime: number;
}

// ============================================================================
// DIRECTORY OPERATIONS INTERFACES
// ============================================================================

export interface MkdirToolArgs {
  path: string;
  recursive?: boolean;
  permissions?: number;
}

export interface DeleteToolArgs {
  path: string;
  recursive?: boolean;
  force?: boolean;
  confirm?: boolean;
}

export interface MoveToolArgs {
  source: string;
  destination: string;
  overwrite?: boolean;
  preserveMetadata?: boolean;
}

export interface DirectoryToolResponse extends BaseToolResponse {
  path?: string;
  created?: boolean;
  deleted?: boolean;
  moved?: boolean;
  itemsAffected?: number;
  metrics?: DirectoryToolMetrics;
}

export interface DirectoryToolMetrics extends ToolMetrics {
  itemsProcessed: number;
  bytesTransferred?: number;
}

// ============================================================================
// SEARCH TOOL INTERFACES
// ============================================================================

export interface SearchToolArgs {
  pattern: string;
  path?: string;
  regex?: boolean;
  caseInsensitive?: boolean;
  wholeWord?: boolean;
  contextLines?: number;
  fileTypes?: string[];
  excludePatterns?: string[];
  maxResults?: number;
  includeHidden?: boolean;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  beforeContext?: string[];
  afterContext?: string[];
}

export interface SearchToolResponse extends BaseToolResponse {
  matches?: SearchMatch[];
  totalMatches?: number;
  filesSearched?: number;
  filesWithMatches?: number;
  truncated?: boolean;
  metrics?: SearchToolMetrics;
}

export interface SearchToolMetrics extends ToolMetrics {
  filesSearched: number;
  bytesSearched: number;
  matchCount: number;
  ripgrepTime?: number;
}

// ============================================================================
// BASH TOOL INTERFACES
// ============================================================================

export interface BashToolArgs {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: string;
  input?: string;
  streaming?: boolean;
  background?: boolean;
}

export interface BashToolResponse extends BaseToolResponse {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  signal?: string;
  timedOut?: boolean;
  cancelled?: boolean;
  pid?: number;
  metrics?: BashToolMetrics;
}

export interface BashToolMetrics extends ToolMetrics {
  executionTime: number;
  stdoutBytes: number;
  stderrBytes: number;
  peakMemoryUsage: number;
  exitCode: number;
  signalReceived?: string;
}

// ============================================================================
// TOOL EXECUTOR INTERFACES
// ============================================================================

export interface ToolCapability {
  name: string;
  version: string;
  description: string;
  arguments: Record<string, any>;
  streaming: boolean;
}

export interface ToolExecutor {
  execute(tool: ToolCall): Promise<BaseToolResponse>;
  stream?(tool: ToolCall): AsyncGenerator<ToolEvent>;
  cancel(executionId: string): Promise<void>;
  getCapabilities(): ToolCapability[];
}

export interface MCPBridge {
  execute(tool: ToolCall): Promise<BaseToolResponse>;
  stream?(tool: ToolCall): AsyncGenerator<ToolEvent>;
  cancel?(executionId: string): Promise<void>;
  getCapabilities(): ToolCapability[];
}

export interface ToolRegistry {
  registerTool(name: string, tool: NativeTool): void;
  unregisterTool(name: string): void;
  getTool(name: string): NativeTool | undefined;
  listTools(): string[];
  getCapabilities(): ToolCapability[];
}

export interface ToolConfig {
  forceMCP?: boolean;
  timeout?: number;
  maxConcurrency?: number;
  workspaceRoot?: string;
  resourceLimits?: ResourceLimits;
}

export interface ResourceLimits {
  maxFileSize?: number;
  maxMemoryUsage?: number;
  maxCpuTime?: number;
  maxOpenFiles?: number;
}

// ============================================================================
// TELEMETRY INTERFACES
// ============================================================================

export interface ToolTelemetry {
  tool: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: ToolError;
  bytesRead?: number;
  bytesWritten?: number;
  exitCode?: number;
  cancelled?: boolean;
  [key: string]: any;
}

// ============================================================================
// SECURITY AND RESOURCE MANAGEMENT INTERFACES
// ============================================================================

export interface SecurityValidationResult {
  allowed: boolean;
  reason?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  actualSize?: number;
  maxAllowedSize?: number;
  fileExists?: boolean;
  error?: PathValidationError;
}

export interface PathValidationError {
  type: 'SYMLINK_TRAVERSAL' | 'CIRCULAR_SYMLINK' | 'PATH_TOO_LONG' | 'BROKEN_SYMLINK' | 'PERMISSION_DENIED';
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  path?: string;
  target?: string;
}

export interface PathNormalizationResult {
  success: boolean;
  normalizedPath?: string;
  isWithinWorkspace?: boolean;
  isSymlink?: boolean;
  symlinkTarget?: string;
  error?: PathValidationError;
}

export interface PathSecurityResult {
  safe: boolean;
  threats: SecurityThreat[];
  normalizedPath?: string;
}

export interface SecurityThreat {
  type: 'DIRECTORY_TRAVERSAL' | 'NULL_BYTE' | 'CRLF_INJECTION' | 'XSS_ATTEMPT' | 'SUSPICIOUS_CHARS';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  position?: number;
}

export interface FileTypeDetectionResult {
  isBinary: boolean;
  mimeType?: string;
  encoding?: string;
  error?: PathValidationError;
}

export interface ResourceLimits {
  maxFileSize?: number;
  maxMemoryUsage?: number;
  maxCpuTime?: number;
  maxOpenFiles?: number;
  maxDirectoryDepth?: number;
  maxGlobResults?: number;
  maxConcurrentOperations?: number;
  operationTimeout?: number;
}

export interface ResourceAcquisitionResult {
  granted: boolean;
  reason?: string;
  queuePosition?: number;
  estimatedWaitTime?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  requestsRemaining?: number;
  windowResetTime?: number;
}

export interface ResourceMonitoringData {
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  cpuUsage?: CPUUsageData;
  openFileHandles?: FileHandleData;
  timestamp: number;
}

export interface CPUUsageData {
  userCPUTime: number;
  systemCPUTime: number;
  percentUsage: number;
  elapsedTime: number;
}

export interface FileHandleData {
  count: number;
  types: Record<string, number>;
  limit: number;
}

export interface OperationMetrics {
  duration: number;
  memoryDelta: number;
  cpuUsage: CPUUsageData;
  success: boolean;
  error?: string;
}

export interface TelemetryEvent extends ToolTelemetry {
  violationType?: string;
  severity?: string;
  path?: string;
  timestamp?: number;
  bytesProcessed?: number;
  memoryUsage?: number;
  cpuTime?: number;
  resourcesUsed?: Record<string, number>;
}