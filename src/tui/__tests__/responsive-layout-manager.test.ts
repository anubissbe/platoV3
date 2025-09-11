import { EventEmitter } from 'events';
import { ResponsiveLayoutManager } from '../responsive-layout-manager.js';
import { BREAKPOINTS } from '../components/ResponsiveContainer.js';

describe('ResponsiveLayoutManager', () => {
  let eventEmitter: EventEmitter;
  let layoutManager: ResponsiveLayoutManager;

  beforeEach(() => {
    eventEmitter = new EventEmitter();
    layoutManager = new ResponsiveLayoutManager(eventEmitter, {
      enableAutoLayout: true,
      enableMobileSupport: true,
      enableFlexibleSizing: true,
      animationDuration: 100
    });
  });

  afterEach(() => {
    eventEmitter.removeAllListeners();
  });

  describe('Terminal resize handling', () => {
    it('should handle terminal resize with debouncing', (done) => {
      const resizeSpy = jest.spyOn(eventEmitter, 'emit');
      
      // Trigger multiple rapid resizes
      layoutManager.handleTerminalResize(100, 30);
      layoutManager.handleTerminalResize(110, 30);
      layoutManager.handleTerminalResize(120, 30);

      // Check that responsive resize event is debounced
      setTimeout(() => {
        // Should only emit once after debounce
        const responsiveResizeEvents = resizeSpy.mock.calls.filter(
          call => call[0] === 'layout:responsive:resize'
        );
        expect(responsiveResizeEvents.length).toBe(1);
        expect(responsiveResizeEvents[0][1]).toMatchObject({
          columns: 120,
          rows: 30,
          breakpoint: 'lg',
          mode: 'expanded'
        });
        done();
      }, 150); // After debounce timeout
    });

    it('should detect breakpoint changes', (done) => {
      const breakpointSpy = jest.fn();
      eventEmitter.on('layout:breakpoint:change', breakpointSpy);

      // Start at medium breakpoint
      layoutManager.handleTerminalResize(80, 24);

      setTimeout(() => {
        // Change to large breakpoint
        layoutManager.handleTerminalResize(120, 30);

        setTimeout(() => {
          expect(breakpointSpy).toHaveBeenCalledWith({
            old: 'md',
            new: 'lg',
            columns: 120,
            rows: 30
          });
          done();
        }, 150);
      }, 150);
    });

    it('should apply mobile optimizations on small screens', (done) => {
      const mobileSpy = jest.fn();
      eventEmitter.on('layout:mobile:optimizations', mobileSpy);

      // Trigger mobile breakpoint
      layoutManager.handleTerminalResize(40, 20); // xs breakpoint

      setTimeout(() => {
        expect(mobileSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            reducedAnimations: true,
            simplifiedBorders: true,
            compactSpacing: true,
            touchFriendlyTargets: true,
            verticalLayoutPriority: true
          })
        );
        done();
      }, 150);
    });
  });

  describe('Layout mode selection', () => {
    it('should select single mode for mobile terminals', () => {
      layoutManager.handleTerminalResize(50, 20); // xs breakpoint
      const state = layoutManager.getResponsiveState();
      expect(state.breakpoint).toBe('xs');
      
      // The optimal layout mode for mobile should be 'single'
      expect(layoutManager.getLayoutMode()).toBe('single');
    });

    it('should select appropriate mode based on terminal size', () => {
      // Small terminal
      layoutManager.handleTerminalResize(70, 25);
      expect(layoutManager.getLayoutMode()).toBe('single');

      // Medium terminal with good height
      layoutManager.handleTerminalResize(90, 35);
      expect(layoutManager.getLayoutMode()).toBe('split');

      // Large terminal
      layoutManager.handleTerminalResize(140, 40);
      expect(layoutManager.getLayoutMode()).toBe('multi');
    });
  });

  describe('Performance tracking', () => {
    it('should track resize performance metrics', () => {
      // Perform several resizes
      layoutManager.handleTerminalResize(80, 24);
      layoutManager.handleTerminalResize(100, 30);
      layoutManager.handleTerminalResize(120, 35);

      const report = layoutManager.getPerformanceReport();
      
      expect(report).toHaveProperty('totalResizes');
      expect(report).toHaveProperty('averageResizeTime');
      expect(report).toHaveProperty('maxResizeTime');
      expect(report).toHaveProperty('minResizeTime');
      expect(report).toHaveProperty('recommendation');
      
      expect(report.totalResizes).toBeGreaterThan(0);
    });

    it('should provide performance recommendations', () => {
      const report = layoutManager.getPerformanceReport();
      expect(report.recommendation).toBe('Performance is optimal');
    });
  });

  describe('Responsive state management', () => {
    it('should provide current responsive state', () => {
      layoutManager.handleTerminalResize(100, 30);
      const state = layoutManager.getResponsiveState();

      expect(state).toHaveProperty('breakpoint');
      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('mobileOptimizations');
      expect(state).toHaveProperty('performanceMetrics');
      expect(state).toHaveProperty('terminalSize');

      expect(state.breakpoint).toBe('md');
      expect(state.mode).toBe('normal');
      expect(state.terminalSize).toEqual({ columns: 100, rows: 30 });
    });

    it('should detect mobile terminal correctly', () => {
      // Mobile size
      layoutManager.handleTerminalResize(40, 20);
      expect(layoutManager.isMobileTerminal()).toBe(true);

      // Small but not mobile
      layoutManager.handleTerminalResize(65, 35);
      expect(layoutManager.isMobileTerminal()).toBe(false);

      // Normal size
      layoutManager.handleTerminalResize(100, 40);
      expect(layoutManager.isMobileTerminal()).toBe(false);
    });
  });

  describe('Configuration updates', () => {
    it('should update responsive configuration', () => {
      const resizeSpy = jest.spyOn(layoutManager, 'handleTerminalResize');
      
      layoutManager.setResponsiveConfig({
        enableAutoLayout: false,
        animationDuration: 500
      });

      // Should trigger a responsive update
      expect(resizeSpy).toHaveBeenCalled();
    });

    it('should force responsive update', () => {
      const originalColumns = process.stdout.columns;
      const originalRows = process.stdout.rows;
      
      process.stdout.columns = 100;
      process.stdout.rows = 30;

      const resizeSpy = jest.spyOn(layoutManager, 'handleTerminalResize');
      layoutManager.forceResponsiveUpdate();

      expect(resizeSpy).toHaveBeenCalledWith(100, 30);

      // Restore
      process.stdout.columns = originalColumns;
      process.stdout.rows = originalRows;
    });
  });

  describe('Panel management', () => {
    it('should inherit panel management from base LayoutManager', () => {
      // ResponsiveLayoutManager extends LayoutManager
      // So it inherits all panel management functionality
      expect(layoutManager).toBeInstanceOf(ResponsiveLayoutManager);
      
      // The layout manager should have responsive-specific methods
      expect(typeof layoutManager.getResponsiveState).toBe('function');
      expect(typeof layoutManager.isMobileTerminal).toBe('function');
      expect(typeof layoutManager.forceResponsiveUpdate).toBe('function');
    });

    it('should handle layout mode changes', () => {
      // Set different layout modes
      layoutManager.setLayoutMode('single');
      expect(layoutManager.getLayoutMode()).toBe('single');
      
      layoutManager.setLayoutMode('split');
      expect(layoutManager.getLayoutMode()).toBe('split');
      
      layoutManager.setLayoutMode('multi');
      expect(layoutManager.getLayoutMode()).toBe('multi');
    });
  });
});