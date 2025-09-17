/**
 * Mouse Configuration Management
 */

export interface MouseConfig {
  mouseMode?: boolean;
  mouseScroll?: boolean;
  mouseClick?: boolean;
  mouseSelection?: boolean;
  scrollSensitivity?: number;
  doubleClickDelay?: number;
  dragThreshold?: number;
}

// Global config storage for testing
const globalConfigStorage: MouseConfig = {};

export class MouseConfiguration {
  public scrollEnabled: boolean = true;
  public clickEnabled: boolean = true;
  public selectionEnabled: boolean = true;
  public scrollSensitivity: number = 3;
  public doubleClickDelay: number = 300;
  public dragThreshold: number = 3;
  private savedConfig: MouseConfig = globalConfigStorage;

  constructor(config?: MouseConfig) {
    if (config) {
      this.scrollEnabled = config.mouseScroll ?? true;
      this.clickEnabled = config.mouseClick ?? true;
      this.selectionEnabled = config.mouseSelection ?? true;
      this.scrollSensitivity = config.scrollSensitivity ?? 3;
      this.doubleClickDelay = config.doubleClickDelay ?? 300;
      this.dragThreshold = config.dragThreshold ?? 3;
    }
  }

  /**
   * Update configuration from partial config
   */
  update(config: Partial<MouseConfig>): void {
    if (config.mouseScroll !== undefined)
      this.scrollEnabled = config.mouseScroll;
    if (config.mouseClick !== undefined) this.clickEnabled = config.mouseClick;
    if (config.mouseSelection !== undefined)
      this.selectionEnabled = config.mouseSelection;
    if (config.scrollSensitivity !== undefined)
      this.scrollSensitivity = config.scrollSensitivity;
    if (config.doubleClickDelay !== undefined)
      this.doubleClickDelay = config.doubleClickDelay;
    if (config.dragThreshold !== undefined)
      this.dragThreshold = config.dragThreshold;
  }

  /**
   * Get current configuration as plain object
   */
  toObject(): MouseConfig {
    return {
      mouseScroll: this.scrollEnabled,
      mouseClick: this.clickEnabled,
      mouseSelection: this.selectionEnabled,
      scrollSensitivity: this.scrollSensitivity,
      doubleClickDelay: this.doubleClickDelay,
      dragThreshold: this.dragThreshold,
    };
  }

  /**
   * Create configuration from saved settings
   */
  static fromObject(config: MouseConfig): MouseConfiguration {
    return new MouseConfiguration(config);
  }

  /**
   * Get configuration value by key
   */
  get(key: string, defaultValue?: any): any {
    switch (key) {
      case "mouseMode":
        return this.savedConfig.mouseMode ?? true;
      case "scrollEnabled":
        return this.scrollEnabled;
      case "clickEnabled":
        return this.clickEnabled;
      case "selectionEnabled":
        return this.selectionEnabled;
      case "scrollSensitivity":
        return this.scrollSensitivity;
      case "doubleClickDelay":
        return this.doubleClickDelay;
      case "dragThreshold":
        return this.dragThreshold;
      default:
        return defaultValue;
    }
  }

  /**
   * Set configuration value by key
   */
  set(key: string, value: any): void {
    switch (key) {
      case "mouseMode":
        this.savedConfig.mouseMode = value;
        break;
      case "scrollEnabled":
        this.scrollEnabled = value;
        break;
      case "clickEnabled":
        this.clickEnabled = value;
        break;
      case "selectionEnabled":
        this.selectionEnabled = value;
        break;
      case "scrollSensitivity":
        if (value < 0 || value > 10) {
          throw new Error("Scroll sensitivity must be between 0 and 10");
        }
        this.scrollSensitivity = value;
        break;
      case "doubleClickDelay":
        if (value <= 0) {
          throw new Error("Double click delay must be positive");
        }
        this.doubleClickDelay = value;
        break;
      case "dragThreshold":
        if (value < 0) {
          throw new Error("Drag threshold must be non-negative");
        }
        this.dragThreshold = value;
        break;
      case "doubleClickThreshold":
        if (value <= 0) {
          throw new Error("Double click threshold must be positive");
        }
        break;
      default:
        throw new Error(`Unknown configuration key: ${key}`);
    }
  }

  /**
   * Load configuration (async for testing)
   */
  async load(): Promise<void> {
    // For testing, restore from saved config
    if (this.savedConfig.mouseScroll !== undefined)
      this.scrollEnabled = this.savedConfig.mouseScroll;
    if (this.savedConfig.mouseClick !== undefined)
      this.clickEnabled = this.savedConfig.mouseClick;
    if (this.savedConfig.mouseSelection !== undefined)
      this.selectionEnabled = this.savedConfig.mouseSelection;
    if (this.savedConfig.scrollSensitivity !== undefined)
      this.scrollSensitivity = this.savedConfig.scrollSensitivity;
    if (this.savedConfig.doubleClickDelay !== undefined)
      this.doubleClickDelay = this.savedConfig.doubleClickDelay;
    if (this.savedConfig.dragThreshold !== undefined)
      this.dragThreshold = this.savedConfig.dragThreshold;
  }

  /**
   * Save configuration (async for testing)
   */
  async save(): Promise<void> {
    // For testing, save to global storage
    Object.assign(globalConfigStorage, {
      mouseMode: this.savedConfig.mouseMode,
      mouseScroll: this.scrollEnabled,
      mouseClick: this.clickEnabled,
      mouseSelection: this.selectionEnabled,
      scrollSensitivity: this.scrollSensitivity,
      doubleClickDelay: this.doubleClickDelay,
      dragThreshold: this.dragThreshold,
    });
  }
}
