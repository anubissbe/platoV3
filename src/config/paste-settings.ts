/**
 * Paste Settings Integration
 * Integrates paste mode settings with Plato's configuration system
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

/**
 * Paste mode configuration settings
 */
export interface PasteSettings {
  /** Default timeout duration in seconds */
  defaultTimeout: number;
  /** Whether paste mode is currently active */
  isActive: boolean;
  /** Current timeout in seconds */
  currentTimeout: number;
  /** Whether to show countdown timer */
  showCountdown: boolean;
  /** Automatically clear after timeout */
  autoClear: boolean;
}

/**
 * Default paste settings
 */
export const DEFAULT_PASTE_SETTINGS: PasteSettings = {
  defaultTimeout: 5,
  isActive: false,
  currentTimeout: 5,
  showCountdown: true,
  autoClear: true,
};

/**
 * Get configuration file path
 */
function getConfigPath(): string {
  const configDir = join(process.cwd(), ".plato");
  const configPath = join(configDir, "paste-settings.json");
  return configPath;
}

/**
 * Ensure configuration directory exists
 */
function ensureConfigDirectory(): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Load paste settings from file
 */
export function loadPasteSettings(): PasteSettings {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_PASTE_SETTINGS };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const loaded = JSON.parse(content) as Partial<PasteSettings>;

    // Merge with defaults to ensure all required fields exist
    return {
      ...DEFAULT_PASTE_SETTINGS,
      ...loaded,
    };
  } catch (error) {
    console.warn("Failed to load paste settings, using defaults:", error);
    return { ...DEFAULT_PASTE_SETTINGS };
  }
}

/**
 * Save paste settings to file
 */
export function savePasteSettings(settings: PasteSettings): void {
  try {
    ensureConfigDirectory();
    const configPath = getConfigPath();

    writeFileSync(
      configPath,
      JSON.stringify(settings, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.warn("Failed to save paste settings:", error);
  }
}

/**
 * Paste settings manager with lazy loading
 */
class PasteSettingsManager {
  private settings: PasteSettings | null = null;
  private timer: NodeJS.Timeout | null = null;

  /**
   * Get current settings (loads from file if not cached)
   */
  getSettings(): PasteSettings {
    if (this.settings === null) {
      this.settings = loadPasteSettings();
    }
    return this.settings;
  }

  /**
   * Update settings and save to file
   */
  updateSettings(newSettings: Partial<PasteSettings>): void {
    const current = this.getSettings();
    this.settings = { ...current, ...newSettings };
    savePasteSettings(this.settings);
  }

  /**
   * Activate paste mode with timeout
   */
  activatePasteMode(timeoutSeconds?: number): PasteSettings {
    const settings = this.getSettings();
    const timeout = timeoutSeconds || settings.defaultTimeout;

    this.updateSettings({
      isActive: true,
      currentTimeout: timeout,
    });

    // Clear any existing timer
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Set auto-clear timer if enabled
    if (settings.autoClear) {
      this.timer = setTimeout(() => {
        this.deactivatePasteMode();
      }, timeout * 1000);
    }

    return this.getSettings();
  }

  /**
   * Deactivate paste mode
   */
  deactivatePasteMode(): PasteSettings {
    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.updateSettings({
      isActive: false,
    });

    return this.getSettings();
  }

  /**
   * Toggle paste mode
   */
  togglePasteMode(timeoutSeconds?: number): PasteSettings {
    const settings = this.getSettings();

    if (settings.isActive) {
      return this.deactivatePasteMode();
    } else {
      return this.activatePasteMode(timeoutSeconds);
    }
  }

  /**
   * Check if paste mode is active
   */
  isActive(): boolean {
    return this.getSettings().isActive;
  }

  /**
   * Reset settings to defaults
   */
  resetSettings(): PasteSettings {
    this.settings = { ...DEFAULT_PASTE_SETTINGS };
    savePasteSettings(this.settings);
    return this.settings;
  }
}

/**
 * Global paste settings manager instance
 */
let pasteSettingsManager: PasteSettingsManager | null = null;

/**
 * Get the global paste settings manager
 */
export function getPasteSettingsManager(): PasteSettingsManager {
  if (pasteSettingsManager === null) {
    pasteSettingsManager = new PasteSettingsManager();
  }
  return pasteSettingsManager;
}

/**
 * Convenience function to check if paste mode is active
 */
export function isPasteModeActive(): boolean {
  return getPasteSettingsManager().isActive();
}

/**
 * Convenience function to get current paste settings
 */
export function getCurrentPasteSettings(): PasteSettings {
  return getPasteSettingsManager().getSettings();
}