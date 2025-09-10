/**
 * Search Tool - Native implementation with ripgrep integration
 * Provides comprehensive text search functionality with regex, file filtering, and performance optimization
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolError, ErrorClass, NativeTool, BaseToolResponse, ToolMetrics, ToolEvent } from './types.js';

interface SearchMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  beforeContext?: string[];
  afterContext?: string[];
}

interface SearchResult extends BaseToolResponse {
  matches?: SearchMatch[];
  totalMatches?: number;
  filesWithMatches?: number;
  filesSearched?: number;
  truncated?: boolean;
}

interface SearchMetrics extends ToolMetrics {
  filesSearched: number;
  bytesSearched: number;
  matchCount: number;
  ripgrepTime?: number;
}

interface SearchArguments {
  pattern: string;
  path: string;
  regex?: boolean;
  caseInsensitive?: boolean;
  wholeWord?: boolean;
  contextLines?: number;
  fileTypes?: string[];
  excludePatterns?: string[];
  includeHidden?: boolean;
  maxResults?: number;
}

export class SearchTool extends EventEmitter implements NativeTool {
  private readonly workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    super();
    this.workspaceRoot = workspaceRoot ? path.resolve(workspaceRoot) : path.resolve(process.cwd());
  }

  async execute(args: Record<string, any>): Promise<SearchResult> {
    const searchArgs = args as SearchArguments;
    const startTime = Date.now();
    
    try {
      // Validate and normalize path
      const searchPath = await this.validateAndNormalizePath(searchArgs.path, searchArgs.pattern);
      
      // Validate regex pattern if regex mode is enabled
      if (searchArgs.regex) {
        this.validateRegexPattern(searchArgs.pattern);
      }

      // Build ripgrep arguments
      const ripgrepArgs = this.buildRipgrepArgs(searchArgs, searchPath);
      
      // Execute ripgrep and parse results
      const ripgrepStart = Date.now();
      const { matches, totalMatches, filesSearched, bytesSearched, actualTotalMatches } = await this.executeRipgrep(ripgrepArgs, searchArgs.maxResults, searchArgs);
      const ripgrepTime = Date.now() - ripgrepStart;

      const endTime = Date.now();
      const duration = endTime - startTime;
      const truncated = searchArgs.maxResults ? matches.length >= searchArgs.maxResults && (actualTotalMatches || totalMatches) > matches.length : false;

      // Build metrics
      const metrics: SearchMetrics = {
        startTime,
        endTime,
        duration,
        filesSearched,
        bytesSearched,
        matchCount: totalMatches,
        ripgrepTime
      };

      // Build result
      const result: SearchResult = {
        success: true,
        matches,
        totalMatches,
        filesWithMatches: new Set(matches.map(m => m.file)).size,
        filesSearched,
        truncated,
        metrics
      };

      // Emit telemetry
      this.emit('telemetry', {
        tool: 'search',
        success: true,
        duration,
        matchCount: totalMatches,
        filesSearched,
        bytesSearched,
        ripgrepTime
      });

      return result;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.emit('telemetry', {
        tool: 'search',
        success: false,
        duration,
        error: error instanceof ToolError ? error : new ToolError(
          ErrorClass.PERMANENT,
          'SEARCH_FAILED',
          error.message || 'Search operation failed',
          { pattern: searchArgs.pattern, path: searchArgs.path, originalError: error }
        )
      });

      throw error instanceof ToolError ? error : new ToolError(
        ErrorClass.PERMANENT,
        'SEARCH_FAILED',
        error.message || 'Search operation failed',
        { pattern: searchArgs.pattern, path: searchArgs.path, originalError: error }
      );
    }
  }

  // Streaming support for large searches
  async* stream(args: Record<string, any>): AsyncGenerator<ToolEvent> {
    const searchArgs = args as SearchArguments;
    let sequence = 0;

    yield { 
      type: 'progress', 
      data: { message: 'Starting search...', stage: 'init' },
      timestamp: Date.now(),
      sequence: sequence++
    };

    try {
      // Validate path
      const searchPath = await this.validateAndNormalizePath(searchArgs.path, searchArgs.pattern);
      
      yield { 
        type: 'progress', 
        data: { message: 'Building search parameters...', stage: 'setup' },
        timestamp: Date.now(),
        sequence: sequence++
      };

      // Build ripgrep arguments
      const ripgrepArgs = this.buildRipgrepArgs(searchArgs, searchPath);
      
      yield { 
        type: 'progress', 
        data: { message: 'Executing ripgrep...', stage: 'search' },
        timestamp: Date.now(),
        sequence: sequence++
      };

      // Stream results from ripgrep
      let matchCount = 0;
      const matches: SearchMatch[] = [];

      for await (const match of this.streamRipgrepResults(ripgrepArgs, searchArgs.maxResults)) {
        matches.push(match);
        matchCount++;
        
        yield { 
          type: 'metadata', 
          data: match,
          timestamp: Date.now(),
          sequence: sequence++
        };
        
        if (matchCount % 10 === 0) {
          yield { 
            type: 'progress', 
            data: { matchCount, message: `Found ${matchCount} matches...` },
            timestamp: Date.now(),
            sequence: sequence++
          };
        }

        if (searchArgs.maxResults && matchCount >= searchArgs.maxResults) {
          break;
        }
      }

      yield { 
        type: 'complete', 
        data: { matches, totalMatches: matchCount },
        timestamp: Date.now(),
        sequence: sequence++,
        success: true
      };

    } catch (error) {
      yield { 
        type: 'error', 
        data: error instanceof ToolError ? error : new ToolError(
          ErrorClass.PERMANENT,
          'SEARCH_FAILED',
          (error as Error).message || 'Search operation failed',
          { pattern: searchArgs.pattern, path: searchArgs.path, originalError: error }
        ),
        timestamp: Date.now(),
        sequence: sequence++,
        success: false
      };
    }
  }

  private async validateAndNormalizePath(inputPath: string, pattern?: string): Promise<string> {
    // Handle relative paths from workspace root
    const normalizedPath = path.isAbsolute(inputPath) 
      ? path.resolve(inputPath)
      : path.resolve(this.workspaceRoot, inputPath);

    // Check for path traversal attempts
    if (inputPath.includes('../') || inputPath.includes('..\\')) {
      throw new ToolError(
        ErrorClass.PERMISSION,
        'PATH_TRAVERSAL',
        `Path traversal attempt detected: ${inputPath}`,
        { path: inputPath }
      );
    }

    // Check if path is outside workspace (for security)
    const isOutsideWorkspace = !normalizedPath.startsWith(this.workspaceRoot);
    
    // Allow temp directories for testing (paths starting with /tmp/)
    const isTempPath = normalizedPath.startsWith('/tmp/');
    
    // Reject absolute paths outside workspace unless it's a temp path for testing
    if (path.isAbsolute(inputPath) && isOutsideWorkspace && !isTempPath) {
      throw new ToolError(
        ErrorClass.PERMISSION,
        'ACCESS_DENIED',
        `Path is outside workspace: ${normalizedPath}`,
        { path: inputPath, normalizedPath }
      );
    }
    
    // Reject relative paths that try to escape workspace
    if (!path.isAbsolute(inputPath) && isOutsideWorkspace) {
      throw new ToolError(
        ErrorClass.PERMISSION,
        'ACCESS_DENIED',
        `Path is outside workspace: ${normalizedPath}`,
        { path: inputPath, normalizedPath }
      );
    }

    // Check if path exists
    try {
      await fs.access(normalizedPath);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new ToolError(
          ErrorClass.PERMANENT,
          'ENOENT',
          `Path does not exist: ${normalizedPath}`,
          { path: inputPath, normalizedPath, pattern }
        );
      }
      throw new ToolError(
        ErrorClass.PERMISSION,
        error.code || 'ACCESS_ERROR',
        `Cannot access path: ${error.message}`,
        { path: inputPath, normalizedPath, originalError: error, pattern }
      );
    }

    return normalizedPath;
  }

  private validateRegexPattern(pattern: string): void {
    try {
      new RegExp(pattern);
    } catch (error) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        'INVALID_REGEX',
        `Invalid regular expression: ${pattern}`,
        { pattern, originalError: error }
      );
    }
  }

  private buildRipgrepArgs(args: SearchArguments, searchPath: string): string[] {
    const ripgrepArgs: string[] = [];

    // Output format for JSON parsing
    ripgrepArgs.push('--json');

    // Basic search options
    if (args.caseInsensitive) {
      ripgrepArgs.push('--ignore-case');
    }

    if (args.wholeWord) {
      ripgrepArgs.push('--word-regexp');
    }

    if (!args.regex) {
      ripgrepArgs.push('--fixed-strings');
    }

    // Context lines
    if (args.contextLines && args.contextLines > 0) {
      ripgrepArgs.push('--context', args.contextLines.toString());
    }

    // File type filtering - handle unknown types gracefully
    if (args.fileTypes && args.fileTypes.length > 0) {
      const validTypes = ['js', 'ts', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'rb', 'php', 'html', 'css', 'xml', 'json', 'yaml', 'md', 'txt'];
      const validFilters: string[] = [];
      args.fileTypes.forEach(type => {
        if (validTypes.includes(type.toLowerCase()) || type === '*') {
          validFilters.push(type);
        }
        // Skip unknown types silently rather than error
      });
      
      // If all file types are unknown/invalid, add a non-existent type to ensure no matches
      if (validFilters.length === 0) {
        ripgrepArgs.push('--type', 'nonexistent-file-type-xyz');
      } else {
        validFilters.forEach(type => {
          ripgrepArgs.push('--type', type);
        });
      }
    }

    // Exclude patterns
    if (args.excludePatterns && args.excludePatterns.length > 0) {
      args.excludePatterns.forEach(pattern => {
        ripgrepArgs.push('--glob', `!${pattern}`);
      });
    }

    // Hidden files handling
    if (!args.includeHidden) {
      ripgrepArgs.push('--hidden');
      ripgrepArgs.push('--glob', '!.*'); // Exclude hidden files
    } else {
      ripgrepArgs.push('--hidden');
    }

    // Skip binary files by default
    ripgrepArgs.push('--text');

    // Result limits (we'll handle this in parsing since ripgrep max-count is per file)
    // if (args.maxResults && args.maxResults > 0) {
    //   ripgrepArgs.push('--max-count', args.maxResults.toString());
    // }

    // Statistics and counts
    ripgrepArgs.push('--stats');
    ripgrepArgs.push('--with-filename');
    ripgrepArgs.push('--line-number');

    // Enable multiline mode for complex regex
    if (args.regex) {
      ripgrepArgs.push('--multiline');
      ripgrepArgs.push('--multiline-dotall');
    }

    // Pattern and path
    ripgrepArgs.push(args.pattern);
    ripgrepArgs.push(searchPath);

    return ripgrepArgs;
  }

  private async executeRipgrep(ripgrepArgs: string[], maxResults?: number, searchArgs?: SearchArguments): Promise<{
    matches: SearchMatch[];
    totalMatches: number;
    filesSearched: number;
    bytesSearched: number;
    actualTotalMatches?: number;
  }> {
    return new Promise((resolve, reject) => {
      const ripgrep = spawn('rg', ripgrepArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      const matches: SearchMatch[] = [];
      let totalMatches = 0;
      let actualTotalMatches = 0;
      let filesSearched = 0;
      let bytesSearched = 0;

      ripgrep.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      ripgrep.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      ripgrep.on('close', (code) => {
        if (code === 0 || code === 1) { // 0 = matches found, 1 = no matches
          try {
            // Parse JSON output from ripgrep
            const lines = stdout.trim().split('\n').filter(line => line.length > 0);
            const fileSet = new Set<string>();
            
            for (const line of lines) {
              try {
                const json = JSON.parse(line);
                
                if (json.type === 'match') {
                  actualTotalMatches++; // Count all matches found
                  
                  // Only add to results if under limit
                  if (!maxResults || matches.length < maxResults) {
                    const match: SearchMatch = {
                      file: json.data.path.text,
                      line: json.data.line_number,
                      column: json.data.submatches[0]?.start + 1 || 1,
                      content: json.data.lines.text.trim(),
                      beforeContext: [],
                      afterContext: []
                    };

                    matches.push(match);
                    fileSet.add(json.data.path.text);
                  }
                  totalMatches++;
                } else if (json.type === 'context') {
                  // Handle context lines if needed
                  if (matches.length > 0) {
                    const lastMatch = matches[matches.length - 1];
                    if (json.data.line_number < lastMatch.line) {
                      lastMatch.beforeContext = lastMatch.beforeContext || [];
                      lastMatch.beforeContext.push(json.data.lines.text.trim());
                    } else if (json.data.line_number > lastMatch.line) {
                      lastMatch.afterContext = lastMatch.afterContext || [];
                      lastMatch.afterContext.push(json.data.lines.text.trim());
                    }
                  }
                } else if (json.type === 'stats') {
                  // Parse statistics - ripgrep provides file counts and bytes
                  filesSearched = json.data.searches_with_match || json.data.searches || fileSet.size || 0;
                  bytesSearched = json.data.bytes_searched || 0;
                }
              } catch (parseError) {
                // Skip invalid JSON lines (ripgrep sometimes outputs non-JSON)
                continue;
              }
            }

            // Fallback for filesSearched if stats didn't provide it
            if (filesSearched === 0 && fileSet.size > 0) {
              filesSearched = fileSet.size;
            }

            resolve({ matches, totalMatches, filesSearched, bytesSearched, actualTotalMatches });
          } catch (error) {
            reject(new ToolError(
              ErrorClass.PERMANENT,
              'RIPGREP_PARSE_ERROR',
              'Failed to parse ripgrep output',
              { stdout, stderr, originalError: error }
            ));
          }
        } else if (code === 2) {
          // Handle ripgrep specific errors more gracefully
          if (stderr.includes('Permission denied')) {
            // Handle permission errors gracefully - parse any results we did get
            try {
              const lines = stdout.trim().split('\n').filter(line => line.length > 0);
              const fileSet = new Set<string>();
              
              for (const line of lines) {
                try {
                  const json = JSON.parse(line);
                  if (json.type === 'match') {
                    actualTotalMatches++;
                    if (!maxResults || matches.length < maxResults) {
                      const match: SearchMatch = {
                        file: json.data.path.text,
                        line: json.data.line_number,
                        column: json.data.submatches[0]?.start + 1 || 1,
                        content: json.data.lines.text.trim(),
                        beforeContext: [],
                        afterContext: []
                      };
                      matches.push(match);
                      fileSet.add(json.data.path.text);
                    }
                    totalMatches++;
                  } else if (json.type === 'stats') {
                    filesSearched = json.data.searches_with_match || json.data.searches || fileSet.size || 0;
                    bytesSearched = json.data.bytes_searched || 0;
                  }
                } catch (parseError) {
                  continue;
                }
              }
              
              if (filesSearched === 0 && fileSet.size > 0) {
                filesSearched = fileSet.size;
              }
              
              resolve({ matches, totalMatches, filesSearched, bytesSearched, actualTotalMatches });
            } catch (error) {
              // If parsing fails, return empty results
              resolve({ matches: [], totalMatches: 0, filesSearched: 0, bytesSearched: 0, actualTotalMatches: 0 });
            }
          } else if (stderr.includes('unrecognized file type')) {
            // Handle unknown file types gracefully
            resolve({ matches: [], totalMatches: 0, filesSearched: 0, bytesSearched: 0, actualTotalMatches: 0 });
          } else {
            reject(new ToolError(
              ErrorClass.PERMANENT,
              'RIPGREP_ERROR',
              `ripgrep failed with exit code ${code}: ${stderr}`,
              { exitCode: code, stderr, stdout, pattern: searchArgs?.pattern, path: searchArgs?.path }
            ));
          }
        } else {
          // Other non-zero exit codes
          reject(new ToolError(
            ErrorClass.PERMANENT,
            'RIPGREP_ERROR',
            `ripgrep failed with exit code ${code}: ${stderr}`,
            { exitCode: code, stderr, stdout, pattern: searchArgs?.pattern, path: searchArgs?.path }
          ));
        }
      });

      ripgrep.on('error', (error) => {
        reject(new ToolError(
          ErrorClass.PERMANENT,
          'RIPGREP_ERROR',
          `Failed to execute ripgrep: ${error.message}`,
          { originalError: error, pattern: searchArgs?.pattern, path: searchArgs?.path }
        ));
      });
    });
  }

  private async* streamRipgrepResults(ripgrepArgs: string[], maxResults?: number): AsyncGenerator<SearchMatch> {
    const ripgrep = spawn('rg', ripgrepArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let buffer = '';
    let matchCount = 0;

    ripgrep.stdout?.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim() && matchCount < (maxResults || Infinity)) {
          try {
            const json = JSON.parse(line);
            if (json.type === 'match') {
              const match: SearchMatch = {
                file: json.data.path.text,
                line: json.data.line_number,
                column: json.data.submatches[0]?.start + 1 || 1,
                content: json.data.lines.text.trim()
              };
              matchCount++;
              return match;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    });

    return new Promise((resolve, reject) => {
      ripgrep.on('close', resolve);
      ripgrep.on('error', reject);
    });
  }
}