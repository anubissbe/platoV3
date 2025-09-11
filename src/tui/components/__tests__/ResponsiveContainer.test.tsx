/**
 * Tests for ResponsiveContainer component
 * Validates responsive breakpoints, layout modes, and terminal size adaptation
 */

import { getBreakpoint, getResponsiveMode, BREAKPOINTS } from '../ResponsiveContainer.js';

describe('ResponsiveContainer utility functions', () => {
  describe('getBreakpoint', () => {
    it('should return correct breakpoint for different column sizes', () => {
      expect(getBreakpoint(30)).toBe('xs');
      expect(getBreakpoint(60)).toBe('sm');
      expect(getBreakpoint(80)).toBe('md');
      expect(getBreakpoint(120)).toBe('lg');
      expect(getBreakpoint(160)).toBe('xl');
      expect(getBreakpoint(200)).toBe('xl');
    });

    it('should handle edge cases', () => {
      expect(getBreakpoint(0)).toBe('xs');
      expect(getBreakpoint(59)).toBe('xs');
      expect(getBreakpoint(60)).toBe('sm');
      expect(getBreakpoint(79)).toBe('sm');
      expect(getBreakpoint(80)).toBe('md');
      expect(getBreakpoint(119)).toBe('md');
      expect(getBreakpoint(120)).toBe('lg');
      expect(getBreakpoint(159)).toBe('lg');
      expect(getBreakpoint(160)).toBe('xl');
      expect(getBreakpoint(1000)).toBe('xl');
    });
  });

  describe('getResponsiveMode', () => {
    it('should return correct mode for different column sizes', () => {
      expect(getResponsiveMode(30)).toBe('compact');
      expect(getResponsiveMode(60)).toBe('compact');
      expect(getResponsiveMode(80)).toBe('normal');
      expect(getResponsiveMode(100)).toBe('normal');
      expect(getResponsiveMode(120)).toBe('expanded');
      expect(getResponsiveMode(200)).toBe('expanded');
    });

    it('should handle edge cases', () => {
      expect(getResponsiveMode(0)).toBe('compact');
      expect(getResponsiveMode(79)).toBe('compact');
      expect(getResponsiveMode(80)).toBe('normal');
      expect(getResponsiveMode(119)).toBe('normal');
      expect(getResponsiveMode(120)).toBe('expanded');
      expect(getResponsiveMode(1000)).toBe('expanded');
    });
  });

  describe('BREAKPOINTS constant', () => {
    it('should have correct breakpoint values', () => {
      expect(BREAKPOINTS.xs).toBe(0);
      expect(BREAKPOINTS.sm).toBe(60);
      expect(BREAKPOINTS.md).toBe(80);
      expect(BREAKPOINTS.lg).toBe(120);
      expect(BREAKPOINTS.xl).toBe(160);
    });
  });
});