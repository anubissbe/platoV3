/**
 * ResponsiveLayoutManager - Enhanced layout management with responsive features
 * Extends the base LayoutManager with advanced responsive capabilities
 */

import { EventEmitter } from "events";
import { LayoutManager, LayoutMode, PanelConfig } from "./layout-manager.js";
import {
  BREAKPOINTS,
  getBreakpoint,
  ResponsiveMode,
  getResponsiveMode,
} from "./components/ResponsiveContainer.js";

export interface ResponsiveLayoutConfig {
  enableAutoLayout?: boolean;
  enableMobileSupport?: boolean;
  enableFlexibleSizing?: boolean;
  customBreakpoints?: Partial<typeof BREAKPOINTS>;
  animationDuration?: number; // ms for transitions
}

export interface MobileOptimizations {
  reducedAnimations: boolean;
  simplifiedBorders: boolean;
  compactSpacing: boolean;
  touchFriendlyTargets: boolean;
  verticalLayoutPriority: boolean;
}

export class ResponsiveLayoutManager extends LayoutManager {
  private responsiveConfig: ResponsiveLayoutConfig;
  private currentBreakpoint: keyof typeof BREAKPOINTS = "md";
  private currentMode: ResponsiveMode = "normal";
  private mobileOptimizations: MobileOptimizations;
  private resizeDebounceTimer: NodeJS.Timeout | null = null;
  private lastResizeTime: number = 0;
  private resizeCount: number = 0;

  // Performance metrics
  private resizePerformanceMetrics = {
    totalResizes: 0,
    averageResizeTime: 0,
    maxResizeTime: 0,
    minResizeTime: Infinity,
  };

  constructor(eventEmitter: EventEmitter, config: ResponsiveLayoutConfig = {}) {
    super(eventEmitter);

    this.responsiveConfig = {
      enableAutoLayout: true,
      enableMobileSupport: true,
      enableFlexibleSizing: true,
      animationDuration: 200,
      ...config,
    };

    this.mobileOptimizations = {
      reducedAnimations: false,
      simplifiedBorders: false,
      compactSpacing: false,
      touchFriendlyTargets: false,
      verticalLayoutPriority: false,
    };

    this.initializeResponsiveFeatures();
  }

  /**
   * Initialize responsive features and event listeners
   */
  private initializeResponsiveFeatures(): void {
    // Set initial breakpoint
    const columns = process.stdout.columns || 80;
    this.currentBreakpoint = getBreakpoint(columns);
    this.currentMode = getResponsiveMode(columns);

    // Apply mobile optimizations if needed
    this.updateMobileOptimizations();
  }

  /**
   * Enhanced terminal resize handling with debouncing and performance tracking
   */
  override handleTerminalResize(columns: number, rows: number): void {
    const startTime = Date.now();

    // Clear existing debounce timer
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }

    // Immediate updates for critical values
    const oldBreakpoint = this.currentBreakpoint;
    const oldMode = this.currentMode;

    this.currentBreakpoint = getBreakpoint(columns);
    this.currentMode = getResponsiveMode(columns);

    // Track resize frequency
    this.resizeCount++;

    // Debounced operations for performance
    this.resizeDebounceTimer = setTimeout(() => {
      this.performResponsiveResize(columns, rows, oldBreakpoint, oldMode);
      this.resizeDebounceTimer = null;
      this.resizeCount = 0;
    }, 100); // 100ms debounce

    // Track performance metrics
    const resizeTime = Date.now() - startTime;
    this.updatePerformanceMetrics(resizeTime);

    // Call parent resize handler
    super.handleTerminalResize(columns, rows);
  }

  /**
   * Perform responsive resize operations
   */
  private performResponsiveResize(
    columns: number,
    rows: number,
    oldBreakpoint: keyof typeof BREAKPOINTS,
    oldMode: ResponsiveMode,
  ): void {
    // Update mobile optimizations if breakpoint changed
    if (oldBreakpoint !== this.currentBreakpoint) {
      this.updateMobileOptimizations();
      this.emitBreakpointChange(oldBreakpoint, this.currentBreakpoint);
    }

    // Apply responsive layout rules
    if (this.responsiveConfig.enableAutoLayout) {
      this.applyResponsiveLayout(columns, rows);
    }

    // Apply flexible sizing if enabled
    if (this.responsiveConfig.enableFlexibleSizing) {
      this.applyFlexibleSizing(columns, rows);
    }

    // Emit responsive resize event
    this.eventEmitter.emit("layout:responsive:resize", {
      columns,
      rows,
      breakpoint: this.currentBreakpoint,
      mode: this.currentMode,
      mobileOptimizations: this.mobileOptimizations,
    });
  }

  /**
   * Apply responsive layout rules based on current breakpoint
   */
  private applyResponsiveLayout(columns: number, rows: number): void {
    const mode = this.getOptimalLayoutMode(columns, rows);

    if (mode !== this.getLayoutMode()) {
      this.setLayoutMode(mode);

      // Adjust panel configurations based on mode
      this.adjustPanelConfigurations(mode, columns);
    }
  }

  /**
   * Determine optimal layout mode based on terminal dimensions
   */
  private getOptimalLayoutMode(columns: number, rows: number): LayoutMode {
    // Mobile-first approach
    if (columns < BREAKPOINTS.sm) {
      return "single"; // Always single panel on mobile
    }

    if (columns < BREAKPOINTS.md) {
      // Small terminals: prefer single or split
      return rows > 30 ? "split" : "single";
    }

    if (columns < BREAKPOINTS.lg) {
      // Medium terminals: split or multi based on height
      return rows > 25 ? "multi" : "split";
    }

    // Large terminals: full multi-panel layout
    return "multi";
  }

  /**
   * Adjust panel configurations based on layout mode and available space
   */
  private adjustPanelConfigurations(mode: LayoutMode, columns: number): void {
    const panels = this.getPanels();

    panels.forEach((panel) => {
      // Calculate optimal width based on mode and breakpoint
      const optimalWidth = this.calculateOptimalPanelWidth(
        panel.config,
        mode,
        columns,
        panels.length,
      );

      // Apply flexible sizing
      if (Math.abs(panel.state.width - optimalWidth) > 5) {
        this.resizePanel(panel.id, optimalWidth);
      }
    });
  }

  /**
   * Calculate optimal panel width based on context
   */
  private calculateOptimalPanelWidth(
    config: PanelConfig,
    mode: LayoutMode,
    columns: number,
    totalPanels: number,
  ): number {
    if (mode === "single") {
      return 100; // Full width in single mode
    }

    // Mobile optimizations
    if (this.mobileOptimizations.verticalLayoutPriority) {
      return 100; // Stack panels vertically on mobile
    }

    // Calculate based on panel type and available space
    const baseWidth = 100 / Math.max(1, this.getVisiblePanels().length);

    // Adjust based on panel type priorities
    switch (config.type) {
      case "conversation":
        // Main content gets more space
        return Math.min(70, baseWidth * 1.5);

      case "info":
      case "tools":
        // Secondary panels get balanced space
        return Math.max(20, baseWidth * 0.8);

      case "status":
        // Status panel gets minimal space
        return Math.max(15, baseWidth * 0.6);

      default:
        return baseWidth;
    }
  }

  /**
   * Apply flexible sizing to all panels
   */
  private applyFlexibleSizing(columns: number, rows: number): void {
    const visiblePanels = this.getVisiblePanels();

    // Calculate total available units (columns minus borders/padding)
    const borderWidth = this.mobileOptimizations.simplifiedBorders ? 0 : 2;
    const padding = this.mobileOptimizations.compactSpacing ? 0 : 2;
    const availableWidth =
      columns - borderWidth * visiblePanels.length - padding;

    // Distribute width proportionally with min/max constraints
    let totalAssigned = 0;
    const assignments: Array<{ panel: any; width: number }> = [];

    visiblePanels.forEach((panel, index) => {
      const isLast = index === visiblePanels.length - 1;

      let width: number;
      if (isLast) {
        // Last panel gets remaining width
        width = 100 - totalAssigned;
      } else {
        // Calculate proportional width
        const proportion = panel.state.width / 100;
        width = Math.round(proportion * 100);
        totalAssigned += width;
      }

      // Apply min/max constraints
      const minWidth = panel.config.minWidth || 15;
      const maxWidth = panel.config.maxWidth || 85;
      width = Math.max(minWidth, Math.min(maxWidth, width));

      assignments.push({ panel, width });
    });

    // Apply calculated widths
    assignments.forEach(({ panel, width }) => {
      if (panel.state.width !== width) {
        panel.state.width = width;
      }
    });
  }

  /**
   * Update mobile optimizations based on current breakpoint
   */
  private updateMobileOptimizations(): void {
    const isMobile =
      this.currentBreakpoint === "xs" || this.currentBreakpoint === "sm";
    const isTablet = this.currentBreakpoint === "md";

    this.mobileOptimizations = {
      reducedAnimations: isMobile,
      simplifiedBorders: isMobile,
      compactSpacing: isMobile || isTablet,
      touchFriendlyTargets: isMobile,
      verticalLayoutPriority: isMobile,
    };

    // Apply optimizations
    if (this.responsiveConfig.enableMobileSupport) {
      this.eventEmitter.emit(
        "layout:mobile:optimizations",
        this.mobileOptimizations,
      );
    }
  }

  /**
   * Emit breakpoint change event
   */
  private emitBreakpointChange(
    oldBreakpoint: keyof typeof BREAKPOINTS,
    newBreakpoint: keyof typeof BREAKPOINTS,
  ): void {
    this.eventEmitter.emit("layout:breakpoint:change", {
      old: oldBreakpoint,
      new: newBreakpoint,
      columns: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    });
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(resizeTime: number): void {
    this.resizePerformanceMetrics.totalResizes++;
    this.resizePerformanceMetrics.maxResizeTime = Math.max(
      this.resizePerformanceMetrics.maxResizeTime,
      resizeTime,
    );
    this.resizePerformanceMetrics.minResizeTime = Math.min(
      this.resizePerformanceMetrics.minResizeTime,
      resizeTime,
    );

    // Calculate running average
    const total =
      this.resizePerformanceMetrics.averageResizeTime *
        (this.resizePerformanceMetrics.totalResizes - 1) +
      resizeTime;
    this.resizePerformanceMetrics.averageResizeTime =
      total / this.resizePerformanceMetrics.totalResizes;
  }

  /**
   * Get current responsive state
   */
  getResponsiveState() {
    return {
      breakpoint: this.currentBreakpoint,
      mode: this.currentMode,
      mobileOptimizations: this.mobileOptimizations,
      performanceMetrics: this.resizePerformanceMetrics,
      terminalSize: this.getTerminalSize(),
    };
  }

  /**
   * Check if running on mobile terminal
   */
  isMobileTerminal(): boolean {
    return (
      this.currentBreakpoint === "xs" ||
      (this.currentBreakpoint === "sm" && this.getTerminalSize().rows < 30)
    );
  }

  /**
   * Force responsive update
   */
  forceResponsiveUpdate(): void {
    const { columns, rows } = this.getTerminalSize();
    this.handleTerminalResize(columns, rows);
  }

  /**
   * Set responsive configuration
   */
  setResponsiveConfig(config: Partial<ResponsiveLayoutConfig>): void {
    this.responsiveConfig = { ...this.responsiveConfig, ...config };
    this.forceResponsiveUpdate();
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    return {
      ...this.resizePerformanceMetrics,
      recommendation: this.getPerformanceRecommendation(),
    };
  }

  /**
   * Get performance recommendation based on metrics
   */
  private getPerformanceRecommendation(): string {
    if (this.resizePerformanceMetrics.averageResizeTime > 100) {
      return "Consider enabling resize debouncing for better performance";
    }
    if (this.resizePerformanceMetrics.totalResizes > 100) {
      return "High resize frequency detected. Terminal may be unstable.";
    }
    return "Performance is optimal";
  }
}

export default ResponsiveLayoutManager;
