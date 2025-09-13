/**
 * Mouse Capabilities Detection for Cross-Platform Terminal Support
 */

export interface MouseCapabilities {
  supportsBasicMouse: boolean;
  supportsWheelEvents: boolean;
  supportsDragEvents: boolean;
  supportsRightClick: boolean;
  terminalType: string;
  platform: string;
  terminal: string;
  isWSL: boolean;
  limitedSupport: boolean;
  supportsSGRMode: boolean;
  fallbackMode: boolean;
}

export class MouseCapabilities {
  public supportsBasicMouse: boolean = false;
  public supportsWheelEvents: boolean = false;
  public supportsDragEvents: boolean = false;
  public supportsRightClick: boolean = false;
  public terminalType: string = 'unknown';
  public platform: string = 'unknown';
  public terminal: string = 'unknown';
  public isWSL: boolean = false;
  public limitedSupport: boolean = false;
  public supportsSGRMode: boolean = false;
  public fallbackMode: boolean = false;

  constructor() {
    this.detectCapabilities();
  }

  private detectCapabilities() {
    // Detect terminal type and capabilities
    const term = process.env.TERM || '';
    const termProgram = process.env.TERM_PROGRAM || '';
    const terminalApp = process.env.TERMINAL_EMULATOR || '';
    
    this.terminalType = term;
    this.platform = process.platform;
    
    // Most modern terminals support basic mouse events
    this.supportsBasicMouse = true;
    this.supportsWheelEvents = true;
    this.supportsDragEvents = true;
    this.supportsRightClick = true;
    this.supportsSGRMode = true;
    
    // Platform-specific detection
    switch (process.platform) {
      case 'win32':
        this.terminal = termProgram || 'Command Prompt';
        if (termProgram === 'Microsoft.Terminal') {
          this.terminal = 'WindowsTerminal';
        }
        break;
      case 'darwin':
        this.terminal = termProgram || 'Terminal.app';
        if (termProgram === 'iTerm.app') {
          this.terminal = 'iTerm.app';
        }
        break;
      case 'linux':
        this.terminal = terminalApp || term || 'xterm';
        if (term.includes('xterm')) {
          this.terminal = 'xterm';
        }
        break;
      default:
        this.terminal = 'unknown';
    }
    
    // WSL2 detection and handling
    this.isWSL = !!(process.env.WSL_DISTRO_NAME || process.env.WSLENV);
    if (this.isWSL) {
      this.limitedSupport = true;
      if (termProgram === 'Microsoft.Terminal') {
        this.supportsBasicMouse = true;
        this.supportsWheelEvents = true;
        this.supportsDragEvents = true;
        this.supportsRightClick = true;
        this.limitedSupport = false;
      }
    }
    
    // Check for unsupported terminals first
    if (term === 'dumb' || term === '' || !term) {
      this.supportsBasicMouse = false;
      this.supportsWheelEvents = false;
      this.supportsDragEvents = false;
      this.supportsRightClick = false;
      this.supportsSGRMode = false;
      this.fallbackMode = true;
    }
    
    // Check for specific terminal limitations
    if (term.includes('screen') || term.includes('tmux')) {
      // Screen/tmux may have limited mouse support depending on configuration
      this.supportsRightClick = false;
      this.fallbackMode = true;
    }
    
    if (termProgram === 'Apple_Terminal' && parseFloat(process.env.TERM_VERSION || '0') < 400) {
      // Older Terminal.app versions have limited mouse support
      this.supportsDragEvents = false;
      this.supportsSGRMode = false;
      this.fallbackMode = true;
    }
    
    // SSH session detection - may have limited capabilities
    if (process.env.SSH_CLIENT || process.env.SSH_TTY) {
      // Conservative defaults for SSH sessions
      this.supportsRightClick = false;
      this.supportsDragEvents = false;
      this.fallbackMode = true;
    }
  }

  /**
   * Get a summary of current terminal mouse capabilities
   */
  getSummary(): string {
    return `Terminal: ${this.terminalType}, Basic: ${this.supportsBasicMouse}, Wheel: ${this.supportsWheelEvents}, Drag: ${this.supportsDragEvents}, RightClick: ${this.supportsRightClick}`;
  }

  /**
   * Check if the current terminal supports a minimum set of mouse features
   */
  hasMinimalSupport(): boolean {
    return this.supportsBasicMouse && this.supportsWheelEvents;
  }

  /**
   * Asynchronous detection method for testing
   */
  async detect(): Promise<MouseCapabilities> {
    this.detectCapabilities();
    return this;
  }
}