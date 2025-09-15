/**
 * Terminal Detection and Capabilities
 * Detects terminal type, features, and platform-specific capabilities
 */

import os from "os";
import fs from "fs/promises";
import path from "path";

export interface TerminalDetection {
  platform: string;
  terminalApp: string;
  version?: string;
  colorSupport: "none" | "basic" | "16color" | "256color" | "truecolor";
  mouseSupport: boolean;
  unicodeSupport: boolean;
  rawModeSupport: boolean;
  isTTY: boolean;
  isWSL?: boolean;
  wslVersion?: number;
  wslDistro?: string;
  isContainer?: boolean;
  containerType?: string;
  dimensions: { width: number; height: number };
}

export class TerminalCapabilities {
  /**
   * Detect terminal capabilities and environment
   */
  detect(): TerminalDetection {
    const platform = process.platform;
    const isTTY = process.stdout.isTTY || false;

    // Get terminal dimensions with fallbacks
    const dimensions = {
      width: process.stdout.columns || 80,
      height: process.stdout.rows || 24,
    };

    // Detect terminal application
    const terminalInfo = this.detectTerminalApp();

    // Detect color support
    const colorSupport = this.detectColorSupport();

    // Detect mouse support
    const mouseSupport = this.detectMouseSupport();

    // Detect Unicode support
    const unicodeSupport = this.detectUnicodeSupport();

    // Detect raw mode support
    const rawModeSupport = this.detectRawModeSupport();

    // Detect WSL environment
    const wslInfo = this.detectWSL();

    // Detect container environment
    const containerInfo = this.detectContainer();

    return {
      platform,
      terminalApp: terminalInfo.name,
      version: terminalInfo.version,
      colorSupport,
      mouseSupport,
      unicodeSupport,
      rawModeSupport,
      isTTY,
      ...wslInfo,
      ...containerInfo,
      dimensions,
    };
  }

  /**
   * Detect terminal application
   */
  private detectTerminalApp(): { name: string; version?: string } {
    const termProgram = process.env.TERM_PROGRAM;
    const termProgramVersion = process.env.TERM_PROGRAM_VERSION;
    const term = process.env.TERM;

    // Windows Terminal
    if (termProgram === "Windows Terminal" || process.env.WT_SESSION) {
      return { name: "Windows Terminal", version: termProgramVersion };
    }

    // iTerm2
    if (termProgram === "iTerm.app") {
      return { name: "iTerm2", version: termProgramVersion };
    }

    // macOS Terminal.app
    if (termProgram === "Apple_Terminal") {
      return { name: "Terminal.app", version: termProgramVersion };
    }

    // VS Code
    if (termProgram === "vscode") {
      return { name: "VS Code", version: termProgramVersion };
    }

    // Hyper
    if (termProgram === "Hyper") {
      return { name: "Hyper", version: termProgramVersion };
    }

    // GNOME Terminal
    if (process.env.GNOME_TERMINAL_SCREEN || process.env.VTE_VERSION) {
      return { name: "GNOME Terminal", version: process.env.VTE_VERSION };
    }

    // KDE Konsole
    if (process.env.KONSOLE_VERSION) {
      return { name: "Konsole", version: process.env.KONSOLE_VERSION };
    }

    // Alacritty
    if (term === "alacritty") {
      return { name: "Alacritty" };
    }

    // Kitty
    if (term === "xterm-kitty" || process.env.KITTY_WINDOW_ID) {
      return { name: "Kitty" };
    }

    // Command Prompt
    if (process.platform === "win32" && process.env.ComSpec && !termProgram) {
      return { name: "Command Prompt" };
    }

    // PowerShell
    if (
      process.platform === "win32" &&
      process.env.PSModulePath &&
      !termProgram
    ) {
      return { name: "PowerShell" };
    }

    // Linux Console
    if (term === "linux") {
      return { name: "Linux Console" };
    }

    // Fallback
    return { name: "Unknown" };
  }

  /**
   * Detect color support level
   */
  private detectColorSupport():
    | "none"
    | "basic"
    | "16color"
    | "256color"
    | "truecolor" {
    if (!process.stdout.isTTY) {
      return "none";
    }

    // Check for truecolor support
    if (
      process.env.COLORTERM === "truecolor" ||
      process.env.COLORTERM === "24bit"
    ) {
      return "truecolor";
    }

    // Check TERM variable
    const term = process.env.TERM || "";

    if (term.includes("256color") || term.includes("256")) {
      return "256color";
    }

    if (term.includes("color")) {
      return "16color";
    }

    // Check if terminal supports colors at all
    if (process.stdout.hasColors && process.stdout.hasColors()) {
      return "basic";
    }

    // Windows Command Prompt typically has basic color support
    if (process.platform === "win32") {
      return "basic";
    }

    return "none";
  }

  /**
   * Detect mouse support
   */
  private detectMouseSupport(): boolean {
    // No mouse support if not TTY
    if (!process.stdout.isTTY) {
      return false;
    }

    const term = process.env.TERM || "";
    const termProgram = process.env.TERM_PROGRAM;

    // Modern terminals generally support mouse
    const modernTerminals = [
      "Windows Terminal",
      "iTerm.app",
      "vscode",
      "Hyper",
      "Apple_Terminal",
    ];

    if (modernTerminals.includes(termProgram || "")) {
      return true;
    }

    // xterm-compatible terminals support mouse
    if (term.startsWith("xterm") || term.includes("256color")) {
      return true;
    }

    // GNOME Terminal and Konsole support mouse
    if (process.env.VTE_VERSION || process.env.KONSOLE_VERSION) {
      return true;
    }

    // Alacritty and Kitty support mouse
    if (term === "alacritty" || term === "xterm-kitty") {
      return true;
    }

    return false;
  }

  /**
   * Detect Unicode support
   */
  private detectUnicodeSupport(): boolean {
    // Modern terminals generally support Unicode
    const lang = process.env.LANG || process.env.LC_ALL || "";

    // UTF-8 locale indicates Unicode support
    if (lang.includes("UTF-8") || lang.includes("utf8")) {
      return true;
    }

    // Windows terminals generally support Unicode
    if (process.platform === "win32") {
      return true;
    }

    // macOS terminals support Unicode
    if (process.platform === "darwin") {
      return true;
    }

    // Most modern Linux terminals support Unicode
    const term = process.env.TERM || "";
    if (term.includes("256color") || term.startsWith("xterm")) {
      return true;
    }

    return false;
  }

  /**
   * Detect raw mode support
   */
  private detectRawModeSupport(): boolean {
    if (!process.stdin.isTTY) {
      return false;
    }

    try {
      // Test if setRawMode is available
      return typeof process.stdin.setRawMode === "function";
    } catch {
      return false;
    }
  }

  /**
   * Detect WSL environment
   */
  private detectWSL(): {
    isWSL?: boolean;
    wslVersion?: number;
    wslDistro?: string;
  } {
    if (process.platform !== "linux") {
      return {};
    }

    const wslDistro = process.env.WSL_DISTRO_NAME;
    const wslEnv = process.env.WSLENV;

    if (!wslDistro && !wslEnv) {
      return {};
    }

    // Detect WSL version from kernel release
    const release = os.release();
    let wslVersion = 1;

    if (
      release.includes("microsoft-standard-WSL2") ||
      release.includes("WSL2")
    ) {
      wslVersion = 2;
    }

    return {
      isWSL: true,
      wslVersion,
      wslDistro,
    };
  }

  /**
   * Detect container environment
   */
  private detectContainer(): { isContainer?: boolean; containerType?: string } {
    // Docker container
    if (process.env.container === "docker") {
      return { isContainer: true, containerType: "docker" };
    }

    // Kubernetes pod
    if (process.env.KUBERNETES_SERVICE_HOST) {
      return { isContainer: true, containerType: "kubernetes" };
    }

    return {};
  }

  /**
   * Encode string for terminal display
   */
  encodeForTerminal(str: string): string {
    // For now, just return the string as-is
    // In the future, could add terminal-specific encoding
    return str;
  }

  /**
   * Get display width of string (accounting for Unicode)
   */
  getStringWidth(str: string): number {
    // Simple implementation - could be enhanced with proper Unicode width calculation
    return str.length;
  }

  /**
   * Translate paths between WSL and Windows
   */
  translatePath(inputPath: string, targetFormat?: "wsl" | "windows"): string {
    // Windows to WSL path translation
    if (inputPath.match(/^[A-Z]:\\/)) {
      const drive = inputPath[0].toLowerCase();
      const restPath = inputPath.slice(3).replace(/\\/g, "/");
      return `/mnt/${drive}/${restPath}`;
    }

    // WSL to Windows path translation
    if (inputPath.startsWith("/mnt/") && targetFormat === "windows") {
      const parts = inputPath.slice(5).split("/");
      if (parts.length > 0) {
        const drive = parts[0].toUpperCase();
        const restPath = parts.slice(1).join("\\");
        return `${drive}:\\${restPath}`;
      }
    }

    return inputPath;
  }

  /**
   * Ensure configuration directory exists
   */
  async ensureConfigDirectory(configDir: string): Promise<void> {
    try {
      await fs.access(configDir);
    } catch {
      await fs.mkdir(configDir, { recursive: true });
    }
  }
}
