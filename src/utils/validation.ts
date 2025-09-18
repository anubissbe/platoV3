/**
 * Input Validation and Sanitization Utilities
 * 
 * Provides comprehensive input validation, path sanitization,
 * length limits, and special character handling for commands.
 */

import { resolve, normalize, isAbsolute } from 'path';
import { access, constants } from 'fs/promises';

export interface ValidationResult {
  isValid: boolean;
  value?: any;
  errors: string[];
  warnings: string[];
}

export interface ValidationRule<T = any> {
  name: string;
  validate: (value: T) => ValidationResult | Promise<ValidationResult>;
  required?: boolean;
  sanitize?: (value: T) => T;
}

export interface CommandValidationOptions {
  /** Maximum argument count */
  maxArgs?: number;
  /** Minimum argument count */
  minArgs?: number;
  /** Maximum total input length */
  maxInputLength?: number;
  /** Allow empty arguments */
  allowEmpty?: boolean;
  /** Trim whitespace */
  trimWhitespace?: boolean;
  /** Custom validation rules */
  customRules?: ValidationRule[];
}

export interface PathValidationOptions {
  /** Allow relative paths */
  allowRelative?: boolean;
  /** Allow paths outside current directory */
  allowOutsideCwd?: boolean;
  /** Required file extensions */
  allowedExtensions?: string[];
  /** Blocked file extensions */
  blockedExtensions?: string[];
  /** Maximum path length */
  maxLength?: number;
  /** Check if path exists */
  mustExist?: boolean;
  /** Check if path is readable */
  mustBeReadable?: boolean;
  /** Check if path is writable */
  mustBeWritable?: boolean;
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: any,
    public rule: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Command argument validator
 */
export class CommandValidator {
  /**
   * Validate command arguments
   */
  static validateArgs(
    args: string[],
    options: CommandValidationOptions = {}
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sanitizedArgs: string[] = [];

    // Check argument count
    if (options.minArgs !== undefined && args.length < options.minArgs) {
      errors.push(`Minimum ${options.minArgs} arguments required, got ${args.length}`);
    }

    if (options.maxArgs !== undefined && args.length > options.maxArgs) {
      errors.push(`Maximum ${options.maxArgs} arguments allowed, got ${args.length}`);
    }

    // Validate total input length
    const totalLength = args.join(' ').length;
    if (options.maxInputLength && totalLength > options.maxInputLength) {
      errors.push(`Input too long: ${totalLength} > ${options.maxInputLength} characters`);
    }

    // Process each argument
    for (let i = 0; i < args.length; i++) {
      let arg = args[i];

      // Trim whitespace if requested
      if (options.trimWhitespace) {
        arg = arg.trim();
      }

      // Check for empty arguments
      if (!arg && !options.allowEmpty) {
        errors.push(`Argument ${i + 1} cannot be empty`);
        continue;
      }

      // Basic security checks
      const securityResult = this.checkSecurity(arg);
      if (!securityResult.isValid) {
        errors.push(...securityResult.errors.map(e => `Argument ${i + 1}: ${e}`));
      }
      warnings.push(...securityResult.warnings.map(w => `Argument ${i + 1}: ${w}`));

      sanitizedArgs.push(arg);
    }

    // Apply custom rules
    if (options.customRules) {
      for (const rule of options.customRules) {
        const result = rule.validate(args);
        if (result instanceof Promise) {
          warnings.push(`Async rule '${rule.name}' cannot be validated synchronously`);
        } else {
          if (!result.isValid) {
            if (rule.required) {
              errors.push(...result.errors.map(e => `Rule '${rule.name}': ${e}`));
            } else {
              warnings.push(...result.errors.map(e => `Rule '${rule.name}': ${e}`));
            }
          }
          warnings.push(...result.warnings.map(w => `Rule '${rule.name}': ${w}`));
        }
      }
    }

    return {
      isValid: errors.length === 0,
      value: sanitizedArgs,
      errors,
      warnings
    };
  }

  /**
   * Async validation for command arguments
   */
  static async validateArgsAsync(
    args: string[],
    options: CommandValidationOptions = {}
  ): Promise<ValidationResult> {
    // Start with synchronous validation
    const syncResult = this.validateArgs(args, options);
    
    if (!syncResult.isValid) {
      return syncResult;
    }

    const errors = [...syncResult.errors];
    const warnings = [...syncResult.warnings];
    
    // Apply async custom rules
    if (options.customRules) {
      for (const rule of options.customRules) {
        try {
          const result = await rule.validate(args);
          if (!result.isValid) {
            if (rule.required) {
              errors.push(...result.errors.map(e => `Rule '${rule.name}': ${e}`));
            } else {
              warnings.push(...result.errors.map(e => `Rule '${rule.name}': ${e}`));
            }
          }
          warnings.push(...result.warnings.map(w => `Rule '${rule.name}': ${w}`));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`Rule '${rule.name}' failed: ${message}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      value: syncResult.value,
      errors,
      warnings
    };
  }

  /**
   * Basic security checks for input
   */
  private static checkSecurity(input: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for potential injection patterns
    const dangerousPatterns = [
      { pattern: /[;&|`$(){}]/g, message: "Contains shell metacharacters", level: "error" },
      { pattern: /\.\.\//g, message: "Contains directory traversal pattern", level: "error" },
      { pattern: /^-/g, message: "Starts with dash (potential flag confusion)", level: "warning" },
      { pattern: /\x00/g, message: "Contains null bytes", level: "error" },
      { pattern: /[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, message: "Contains control characters", level: "warning" },
      { pattern: /^\s+|\s+$/g, message: "Has leading/trailing whitespace", level: "warning" }
    ];

    for (const { pattern, message, level } of dangerousPatterns) {
      if (pattern.test(input)) {
        if (level === "error") {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Path validator and sanitizer
 */
export class PathValidator {
  /**
   * Validate and sanitize a file path
   */
  static async validatePath(
    path: string,
    options: PathValidationOptions = {}
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!path || typeof path !== 'string') {
      errors.push('Path must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    // Length check
    if (options.maxLength && path.length > options.maxLength) {
      errors.push(`Path too long: ${path.length} > ${options.maxLength} characters`);
    }

    // Normalize and resolve path
    let normalizedPath: string;
    try {
      normalizedPath = normalize(path);
      if (isAbsolute(path) || !options.allowRelative) {
        normalizedPath = resolve(normalizedPath);
      }
    } catch (error) {
      errors.push(`Invalid path format: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, value: path, errors, warnings };
    }

    // Security checks
    const securityResult = this.checkPathSecurity(normalizedPath, options);
    errors.push(...securityResult.errors);
    warnings.push(...securityResult.warnings);

    // Extension checks
    if (options.allowedExtensions || options.blockedExtensions) {
      const extResult = this.validateExtension(normalizedPath, options);
      errors.push(...extResult.errors);
      warnings.push(...extResult.warnings);
    }

    // File system checks
    if (options.mustExist || options.mustBeReadable || options.mustBeWritable) {
      const fsResult = await this.validateFileSystem(normalizedPath, options);
      errors.push(...fsResult.errors);
      warnings.push(...fsResult.warnings);
    }

    return {
      isValid: errors.length === 0,
      value: normalizedPath,
      errors,
      warnings
    };
  }

  /**
   * Check path security
   */
  private static checkPathSecurity(
    path: string,
    options: PathValidationOptions
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Directory traversal check
    if (path.includes('../') || path.includes('..\\')) {
      errors.push('Path contains directory traversal sequences');
    }

    // Null byte check
    if (path.includes('\x00')) {
      errors.push('Path contains null bytes');
    }

    // Check if path goes outside current working directory
    if (!options.allowOutsideCwd) {
      const cwd = process.cwd();
      const resolvedPath = resolve(path);
      if (!resolvedPath.startsWith(cwd)) {
        errors.push('Path goes outside current working directory');
      }
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      { pattern: /\.(bat|cmd|exe|scr|com|pif)$/i, message: "Executable file extension" },
      { pattern: /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, message: "Windows reserved name" },
      { pattern: /[<>:"|*?]/g, message: "Contains invalid filename characters" },
      { pattern: /^\s+|\s+$/g, message: "Has leading/trailing whitespace" }
    ];

    for (const { pattern, message } of suspiciousPatterns) {
      if (pattern.test(path)) {
        warnings.push(message);
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate file extension
   */
  private static validateExtension(
    path: string,
    options: PathValidationOptions
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const ext = path.split('.').pop()?.toLowerCase();

    if (options.allowedExtensions && options.allowedExtensions.length > 0) {
      if (!ext || !options.allowedExtensions.includes(ext)) {
        errors.push(`File extension '${ext || 'none'}' not in allowed list: ${options.allowedExtensions.join(', ')}`);
      }
    }

    if (options.blockedExtensions && options.blockedExtensions.length > 0) {
      if (ext && options.blockedExtensions.includes(ext)) {
        errors.push(`File extension '${ext}' is blocked`);
      }
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate file system properties
   */
  private static async validateFileSystem(
    path: string,
    options: PathValidationOptions
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if file exists
      if (options.mustExist) {
        try {
          await access(path, constants.F_OK);
        } catch {
          errors.push('Path does not exist');
          return { isValid: false, errors, warnings }; // No point checking further
        }
      }

      // Check if readable
      if (options.mustBeReadable) {
        try {
          await access(path, constants.R_OK);
        } catch {
          errors.push('Path is not readable');
        }
      }

      // Check if writable
      if (options.mustBeWritable) {
        try {
          await access(path, constants.W_OK);
        } catch {
          errors.push('Path is not writable');
        }
      }
    } catch (error) {
      warnings.push(`File system check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /**
   * Sanitize path by removing dangerous elements
   */
  static sanitizePath(path: string): string {
    return path
      .replace(/\.\./g, '') // Remove directory traversal
      .replace(/[<>:"|*?]/g, '') // Remove invalid characters
      .replace(/\x00/g, '') // Remove null bytes
      .replace(/^\s+|\s+$/g, '') // Remove leading/trailing whitespace
      .replace(/\/{2,}/g, '/') // Collapse multiple slashes
      .replace(/\\{2,}/g, '\\'); // Collapse multiple backslashes
  }
}

/**
 * URL validator
 */
export class URLValidator {
  /**
   * Validate URL with security checks
   */
  static validateURL(url: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!url || typeof url !== 'string') {
      errors.push('URL must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    try {
      const parsed = new URL(url);

      // Protocol whitelist
      const allowedProtocols = ['http:', 'https:', 'ws:', 'wss:'];
      if (!allowedProtocols.includes(parsed.protocol)) {
        errors.push(`Protocol '${parsed.protocol}' not allowed. Use: ${allowedProtocols.join(', ')}`);
      }

      // Check for localhost/private network access
      const hostname = parsed.hostname.toLowerCase();
      const privateNetworks = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^::1$/,
        /^fc00:/,
        /^fd[0-9a-f]{2}:/
      ];

      const isPrivate = privateNetworks.some(pattern => 
        typeof pattern === 'string' 
          ? hostname === pattern 
          : pattern.test(hostname)
      );

      if (isPrivate) {
        warnings.push('URL points to private/local network');
      }

      // Port checks
      const port = parsed.port;
      if (port) {
        const portNum = parseInt(port, 10);
        if (portNum < 1 || portNum > 65535) {
          errors.push(`Invalid port number: ${port}`);
        }
        
        // Warn about common service ports
        const commonPorts = [22, 23, 25, 53, 80, 110, 143, 443, 993, 995];
        if (commonPorts.includes(portNum)) {
          warnings.push(`Using common service port: ${port}`);
        }
      }

      return {
        isValid: errors.length === 0,
        value: parsed,
        errors,
        warnings
      };
    } catch (error) {
      errors.push(`Invalid URL: ${error instanceof Error ? error.message : String(error)}`);
      return { isValid: false, errors, warnings };
    }
  }
}

/**
 * Generic data validator with common patterns
 */
export class DataValidator {
  /**
   * Validate string with length and pattern constraints
   */
  static validateString(
    value: string,
    options: {
      minLength?: number;
      maxLength?: number;
      pattern?: RegExp;
      allowEmpty?: boolean;
      trim?: boolean;
    } = {}
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let processedValue = value;

    if (options.trim) {
      processedValue = processedValue.trim();
    }

    if (!processedValue && !options.allowEmpty) {
      errors.push('Value cannot be empty');
    }

    if (options.minLength !== undefined && processedValue.length < options.minLength) {
      errors.push(`Value too short: ${processedValue.length} < ${options.minLength}`);
    }

    if (options.maxLength !== undefined && processedValue.length > options.maxLength) {
      errors.push(`Value too long: ${processedValue.length} > ${options.maxLength}`);
    }

    if (options.pattern && !options.pattern.test(processedValue)) {
      errors.push(`Value does not match required pattern`);
    }

    return {
      isValid: errors.length === 0,
      value: processedValue,
      errors,
      warnings
    };
  }

  /**
   * Validate number with range constraints
   */
  static validateNumber(
    value: any,
    options: {
      min?: number;
      max?: number;
      integer?: boolean;
      positive?: boolean;
    } = {}
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num) || typeof num !== 'number') {
      errors.push('Value must be a valid number');
      return { isValid: false, errors, warnings };
    }

    if (options.integer && !Number.isInteger(num)) {
      errors.push('Value must be an integer');
    }

    if (options.positive && num <= 0) {
      errors.push('Value must be positive');
    }

    if (options.min !== undefined && num < options.min) {
      errors.push(`Value too small: ${num} < ${options.min}`);
    }

    if (options.max !== undefined && num > options.max) {
      errors.push(`Value too large: ${num} > ${options.max}`);
    }

    return {
      isValid: errors.length === 0,
      value: num,
      errors,
      warnings
    };
  }

  /**
   * Validate array with size and element constraints
   */
  static validateArray(
    value: any,
    options: {
      minLength?: number;
      maxLength?: number;
      elementValidator?: (element: any, index: number) => ValidationResult;
      allowEmpty?: boolean;
    } = {}
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(value)) {
      errors.push('Value must be an array');
      return { isValid: false, errors, warnings };
    }

    if (!options.allowEmpty && value.length === 0) {
      errors.push('Array cannot be empty');
    }

    if (options.minLength !== undefined && value.length < options.minLength) {
      errors.push(`Array too short: ${value.length} < ${options.minLength}`);
    }

    if (options.maxLength !== undefined && value.length > options.maxLength) {
      errors.push(`Array too long: ${value.length} > ${options.maxLength}`);
    }

    // Validate elements if validator provided
    if (options.elementValidator) {
      value.forEach((element, index) => {
        const elementResult = options.elementValidator!(element, index);
        if (!elementResult.isValid) {
          errors.push(...elementResult.errors.map(e => `Element ${index}: ${e}`));
        }
        warnings.push(...elementResult.warnings.map(w => `Element ${index}: ${w}`));
      });
    }

    return {
      isValid: errors.length === 0,
      value,
      errors,
      warnings
    };
  }
}
