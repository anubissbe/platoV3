/**
 * Path Validator - Security-focused path validation with symlink resolution
 * and directory traversal prevention for PlatoV3 native tools
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  PathNormalizationResult, 
  PathSecurityResult, 
  PathValidationError, 
  SecurityThreat,
  ToolError,
  ErrorClass
} from './types.js';

export class PathValidator {
  private readonly workspaceRoot: string;
  private readonly maxPathLength: number = 4096;
  private readonly maxSymlinkDepth: number = 40;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Normalize a path with security validation and symlink resolution
   */
  async normalizePath(inputPath: string): Promise<PathNormalizationResult> {
    try {
      // Basic path length check
      if (inputPath.length > this.maxPathLength) {
        return {
          success: false,
          error: {
            type: 'PATH_TOO_LONG',
            message: `Path exceeds maximum length of ${this.maxPathLength} characters`,
            severity: 'medium',
            path: inputPath
          }
        };
      }

      // Resolve path - if absolute, use as-is; if relative, resolve from workspace
      const resolvedPath = path.isAbsolute(inputPath) 
        ? path.resolve(inputPath)
        : path.resolve(this.workspaceRoot, inputPath);
      
      // Check for workspace boundary violation
      if (!this.isWithinWorkspace(resolvedPath)) {
        return {
          success: false,
          error: {
            type: 'SYMLINK_TRAVERSAL',
            message: `Path resolves outside workspace boundary: ${resolvedPath}`,
            severity: 'critical',
            path: inputPath,
            target: resolvedPath
          }
        };
      }

      // Handle symlink resolution with cycle detection
      const symlinkResult = await this.resolveSymlinks(resolvedPath);
      if (!symlinkResult.success) {
        return {
          success: false,
          error: symlinkResult.error
        };
      }

      return {
        success: true,
        normalizedPath: symlinkResult.resolvedPath,
        isWithinWorkspace: true,
        isSymlink: symlinkResult.isSymlink,
        symlinkTarget: symlinkResult.symlinkTarget
      };

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'PERMISSION_DENIED',
          message: `Path validation failed: ${(error as Error).message}`,
          severity: 'high',
          path: inputPath
        }
      };
    }
  }

  /**
   * Validate path for security threats
   */
  async validatePathSecurity(inputPath: string): Promise<PathSecurityResult> {
    const threats: SecurityThreat[] = [];

    // Check for directory traversal attempts
    if (inputPath.includes('../') || inputPath.includes('..\\')) {
      threats.push({
        type: 'DIRECTORY_TRAVERSAL',
        severity: 'high',
        message: 'Path contains directory traversal sequences (../)',
        position: inputPath.indexOf('../')
      });
    }

    // Check for null byte injection
    if (inputPath.includes('\0')) {
      threats.push({
        type: 'NULL_BYTE',
        severity: 'high',
        message: 'Path contains null byte characters',
        position: inputPath.indexOf('\0')
      });
    }

    // Check for CRLF injection
    if (inputPath.includes('\r') || inputPath.includes('\n')) {
      threats.push({
        type: 'CRLF_INJECTION',
        severity: 'medium',
        message: 'Path contains CRLF characters',
        position: Math.max(inputPath.indexOf('\r'), inputPath.indexOf('\n'))
      });
    }

    // Check for XSS attempts in filenames
    const xssPatterns = ['<script>', '</script>', 'javascript:', 'data:'];
    for (const pattern of xssPatterns) {
      if (inputPath.toLowerCase().includes(pattern)) {
        threats.push({
          type: 'XSS_ATTEMPT',
          severity: 'medium',
          message: `Path contains potentially malicious pattern: ${pattern}`,
          position: inputPath.toLowerCase().indexOf(pattern)
        });
      }
    }

    // Check for suspicious control characters
    const suspiciousChars = /[\x00-\x1f\x7f-\x9f]/;
    if (suspiciousChars.test(inputPath)) {
      threats.push({
        type: 'SUSPICIOUS_CHARS',
        severity: 'medium',
        message: 'Path contains suspicious control characters',
        position: inputPath.search(suspiciousChars)
      });
    }

    const safe = threats.length === 0;
    let normalizedPath: string | undefined;

    if (safe) {
      try {
        normalizedPath = path.normalize(inputPath);
      } catch (error) {
        // Normalization failed, but we can still report it as unsafe
      }
    }

    return {
      safe,
      threats,
      normalizedPath
    };
  }

  /**
   * Resolve symlinks with cycle detection and workspace boundary enforcement
   */
  private async resolveSymlinks(targetPath: string): Promise<{
    success: boolean;
    resolvedPath?: string;
    isSymlink?: boolean;
    symlinkTarget?: string;
    error?: PathValidationError;
  }> {
    const visitedPaths = new Set<string>();
    let currentPath = targetPath;
    let isSymlink = false;
    let symlinkTarget: string | undefined;
    let depth = 0;

    while (depth < this.maxSymlinkDepth) {
      // Check for cycles
      if (visitedPaths.has(currentPath)) {
        return {
          success: false,
          error: {
            type: 'CIRCULAR_SYMLINK',
            message: `Circular symlink detected: ${Array.from(visitedPaths).join(' -> ')} -> ${currentPath}`,
            severity: 'high',
            path: targetPath,
            target: currentPath
          }
        };
      }

      visitedPaths.add(currentPath);

      try {
        const stat = await fs.lstat(currentPath);
        
        if (stat.isSymbolicLink()) {
          isSymlink = true;
          const linkTarget = await fs.readlink(currentPath);
          
          // Resolve the symlink target relative to the symlink's directory
          const resolvedTarget = path.resolve(path.dirname(currentPath), linkTarget);
          
          if (!symlinkTarget) {
            symlinkTarget = resolvedTarget;
          }

          // Check if symlink points outside workspace
          if (!this.isWithinWorkspace(resolvedTarget)) {
            return {
              success: false,
              error: {
                type: 'SYMLINK_TRAVERSAL',
                message: `Symlink points outside workspace: ${currentPath} -> ${resolvedTarget}`,
                severity: 'critical',
                path: targetPath,
                target: resolvedTarget
              }
            };
          }

          currentPath = resolvedTarget;
          depth++;
        } else {
          // Not a symlink, we're done
          break;
        }
      } catch (error: any) {
        // Handle broken symlinks or permission errors
        if (error.code === 'ENOENT') {
          return {
            success: false,
            error: {
              type: 'BROKEN_SYMLINK',
              message: `Broken symlink detected: ${currentPath}`,
              severity: 'medium',
              path: targetPath,
              target: currentPath
            }
          };
        }
        
        return {
          success: false,
          error: {
            type: 'PERMISSION_DENIED',
            message: `Cannot access symlink target: ${error.message}`,
            severity: 'high',
            path: targetPath,
            target: currentPath
          }
        };
      }
    }

    if (depth >= this.maxSymlinkDepth) {
      return {
        success: false,
        error: {
          type: 'CIRCULAR_SYMLINK',
          message: `Symlink depth limit exceeded (${this.maxSymlinkDepth})`,
          severity: 'high',
          path: targetPath
        }
      };
    }

    return {
      success: true,
      resolvedPath: currentPath,
      isSymlink,
      symlinkTarget
    };
  }

  /**
   * Check if a path is within the workspace boundary
   */
  private isWithinWorkspace(targetPath: string): boolean {
    try {
      const normalizedWorkspace = path.resolve(this.workspaceRoot);
      const normalizedTarget = path.resolve(targetPath);
      
      // Get relative path to check if it goes outside workspace
      const relativePath = path.relative(normalizedWorkspace, normalizedTarget);
      
      // If relative path starts with '..', it's outside workspace
      return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
    } catch (error) {
      // If normalization fails, deny access
      return false;
    }
  }

  /**
   * Get workspace root path
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Validate multiple paths efficiently
   */
  async validatePaths(paths: string[]): Promise<Map<string, PathNormalizationResult>> {
    const results = new Map<string, PathNormalizationResult>();
    
    // Process paths in parallel for better performance
    const validationPromises = paths.map(async (inputPath) => {
      const result = await this.normalizePath(inputPath);
      return { path: inputPath, result };
    });

    const validationResults = await Promise.all(validationPromises);
    
    for (const { path, result } of validationResults) {
      results.set(path, result);
    }

    return results;
  }

  /**
   * Create a scoped validator for a subdirectory
   */
  createScopedValidator(subdirectory: string): PathValidator {
    const scopedRoot = path.resolve(this.workspaceRoot, subdirectory);
    
    // Ensure the scoped root is within the original workspace
    if (!this.isWithinWorkspace(scopedRoot)) {
      throw new ToolError(
        ErrorClass.VALIDATION,
        'INVALID_SCOPE',
        `Scoped directory is outside workspace: ${scopedRoot}`
      );
    }

    return new PathValidator(scopedRoot);
  }
}