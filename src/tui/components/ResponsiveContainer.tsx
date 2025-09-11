/**
 * ResponsiveContainer - Adaptive container component for terminal resizing
 * Provides responsive layout management and breakpoint-based rendering
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Box } from 'ink';
import { StyledBox, StyledText } from '../../styles/components.js';

// Responsive breakpoints for terminal widths
export const BREAKPOINTS = {
  xs: 0,    // Extra small: mobile terminals, < 60 columns
  sm: 60,   // Small: narrow terminals, 60-80 columns
  md: 80,   // Medium: standard terminals, 80-120 columns  
  lg: 120,  // Large: wide terminals, 120-160 columns
  xl: 160,  // Extra large: ultra-wide terminals, 160+ columns
} as const;

// Layout modes based on available space
export type ResponsiveMode = 'compact' | 'normal' | 'expanded';

export interface ResponsiveContainerProps {
  children: React.ReactNode | ((mode: ResponsiveMode, size: TerminalSize) => React.ReactNode);
  minWidth?: number;
  minHeight?: number;
  flexDirection?: 'row' | 'column';
  flexGrow?: number;
  padding?: number;
  borderStyle?: 'single' | 'double' | 'round' | 'bold';
  adaptivePadding?: boolean; // Reduce padding on small screens
  adaptiveBorder?: boolean; // Remove border on very small screens
  onResize?: (size: TerminalSize) => void;
}

export interface TerminalSize {
  columns: number;
  rows: number;
  breakpoint: keyof typeof BREAKPOINTS;
  mode: ResponsiveMode;
}

/**
 * Hook to track terminal size with breakpoint detection
 */
export const useResponsiveTerminalSize = () => {
  const [size, setSize] = useState<TerminalSize>(() => {
    const columns = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    return {
      columns,
      rows,
      breakpoint: getBreakpoint(columns),
      mode: getResponsiveMode(columns),
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const columns = process.stdout.columns || 80;
      const rows = process.stdout.rows || 24;
      setSize({
        columns,
        rows,
        breakpoint: getBreakpoint(columns),
        mode: getResponsiveMode(columns),
      });
    };

    // Listen for terminal resize events
    process.stdout.on('resize', handleResize);
    
    // Initial size check
    handleResize();

    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return size;
};

/**
 * Get the current breakpoint based on terminal width
 */
export const getBreakpoint = (columns: number): keyof typeof BREAKPOINTS => {
  if (columns >= BREAKPOINTS.xl) return 'xl';
  if (columns >= BREAKPOINTS.lg) return 'lg';
  if (columns >= BREAKPOINTS.md) return 'md';
  if (columns >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
};

/**
 * Get responsive mode based on terminal width
 */
export const getResponsiveMode = (columns: number): ResponsiveMode => {
  if (columns >= BREAKPOINTS.lg) return 'expanded';
  if (columns >= BREAKPOINTS.md) return 'normal';
  return 'compact';
};

/**
 * Calculate adaptive padding based on terminal size
 */
const getAdaptivePadding = (
  basePadding: number | undefined,
  breakpoint: keyof typeof BREAKPOINTS,
  adaptivePadding: boolean
): number => {
  if (!adaptivePadding) return basePadding || 1;
  
  const base = basePadding || 1;
  
  switch (breakpoint) {
    case 'xs':
      return Math.max(0, base - 1); // Minimal padding on mobile
    case 'sm':
      return Math.max(0, base - 1); // Reduced padding on small
    case 'md':
      return base; // Normal padding
    case 'lg':
    case 'xl':
      return base; // Full padding on large screens
    default:
      return base;
  }
};

/**
 * Determine if border should be shown based on size
 */
const shouldShowBorder = (
  breakpoint: keyof typeof BREAKPOINTS,
  adaptiveBorder: boolean
): boolean => {
  if (!adaptiveBorder) return true;
  
  // Hide borders on extra small screens to save space
  return breakpoint !== 'xs';
};

/**
 * ResponsiveContainer component
 */
export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  minWidth,
  minHeight,
  flexDirection = 'column',
  flexGrow,
  padding = 1,
  borderStyle = 'single',
  adaptivePadding = true,
  adaptiveBorder = true,
  onResize,
}) => {
  const size = useResponsiveTerminalSize();
  
  // Calculate responsive values
  const responsivePadding = useMemo(
    () => getAdaptivePadding(padding, size.breakpoint, adaptivePadding),
    [padding, size.breakpoint, adaptivePadding]
  );
  
  const showBorder = useMemo(
    () => shouldShowBorder(size.breakpoint, adaptiveBorder),
    [size.breakpoint, adaptiveBorder]
  );
  
  const effectiveBorderStyle = showBorder ? borderStyle : undefined;
  
  // Notify parent of resize
  useEffect(() => {
    onResize?.(size);
  }, [size, onResize]);
  
  // Determine content based on children type
  const content = useMemo(() => {
    if (typeof children === 'function') {
      return children(size.mode, size);
    }
    return children;
  }, [children, size]);
  
  // Check minimum size requirements
  const meetsMinimumSize = 
    (!minWidth || size.columns >= minWidth) &&
    (!minHeight || size.rows >= minHeight);
  
  if (!meetsMinimumSize) {
    // Display a minimal message when terminal is too small
    return (
      <Box>
        <StyledText type="warning">
          Terminal too small ({size.columns}x{size.rows})
        </StyledText>
      </Box>
    );
  }
  
  return (
    <Box
      flexDirection={flexDirection}
      flexGrow={flexGrow}
      paddingLeft={responsivePadding}
      paddingRight={responsivePadding}
      paddingTop={responsivePadding}
      paddingBottom={responsivePadding}
      borderStyle={effectiveBorderStyle}
      width={size.columns}
      minHeight={minHeight}
    >
      {content}
    </Box>
  );
};

/**
 * Hook to create responsive styles based on breakpoints
 */
export const useResponsiveStyles = () => {
  const size = useResponsiveTerminalSize();
  
  return useMemo(() => ({
    // Spacing
    padding: size.mode === 'compact' ? 0 : size.mode === 'normal' ? 1 : 2,
    margin: size.mode === 'compact' ? 0 : 1,
    
    // Typography
    fontSize: size.mode === 'compact' ? 'small' : 'normal',
    
    // Layout
    flexDirection: size.columns < BREAKPOINTS.md ? 'column' as const : 'row' as const,
    
    // Visibility
    showDetails: size.mode !== 'compact',
    showIcons: size.columns >= BREAKPOINTS.sm,
    showTimestamps: size.columns >= BREAKPOINTS.md,
    showMetadata: size.columns >= BREAKPOINTS.lg,
    
    // Component specific
    inputHeight: size.mode === 'compact' ? 2 : size.mode === 'normal' ? 3 : 4,
    headerHeight: size.mode === 'compact' ? 2 : 3,
    maxMessageWidth: Math.min(size.columns - 4, 120),
  }), [size]);
};

/**
 * Responsive grid component for multi-column layouts
 */
export interface ResponsiveGridProps {
  children: React.ReactNode[];
  columns?: number | 'auto';
  gap?: number;
  minColumnWidth?: number;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  columns = 'auto',
  gap = 1,
  minColumnWidth = 20,
}) => {
  const size = useResponsiveTerminalSize();
  
  const columnCount = useMemo(() => {
    if (columns === 'auto') {
      // Calculate columns based on available width
      const availableWidth = size.columns - (gap * 2);
      return Math.max(1, Math.floor(availableWidth / minColumnWidth));
    }
    return columns;
  }, [columns, size.columns, gap, minColumnWidth]);
  
  const columnWidth = useMemo(() => {
    const totalGaps = gap * (columnCount + 1);
    return Math.floor((size.columns - totalGaps) / columnCount);
  }, [size.columns, columnCount, gap]);
  
  // Group children into rows
  const rows = useMemo(() => {
    const result: React.ReactNode[][] = [];
    for (let i = 0; i < children.length; i += columnCount) {
      result.push(children.slice(i, i + columnCount));
    }
    return result;
  }, [children, columnCount]);
  
  return (
    <Box flexDirection="column">
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex} flexDirection="row" marginBottom={rowIndex < rows.length - 1 ? gap : 0}>
          {row.map((child, colIndex) => (
            <Box key={colIndex} width={columnWidth} marginRight={colIndex < row.length - 1 ? gap : 0}>
              {child}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
};

export default ResponsiveContainer;