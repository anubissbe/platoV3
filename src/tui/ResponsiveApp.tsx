/**
 * ResponsiveApp - Wrapper component that adds responsive design to the TUI
 * Provides automatic layout adaptation based on terminal size
 */

import React, { useEffect, useState } from "react";
import { Box } from "ink";
import { EventEmitter } from "events";
import { ResponsiveLayoutManager } from "./responsive-layout-manager.js";
import {
  ResponsiveContainer,
  useResponsiveTerminalSize,
} from "./components/ResponsiveContainer.js";

export interface ResponsiveAppProps {
  children: React.ReactNode;
  onLayoutChange?: (mode: "single" | "split" | "multi") => void;
}

/**
 * ResponsiveApp wrapper that provides responsive layout management
 */
export const ResponsiveApp: React.FC<ResponsiveAppProps> = ({
  children,
  onLayoutChange,
}) => {
  const terminalSize = useResponsiveTerminalSize();
  const [layoutManager, setLayoutManager] =
    useState<ResponsiveLayoutManager | null>(null);
  const [layoutMode, setLayoutMode] = useState<"single" | "split" | "multi">(
    "split",
  );

  // Initialize the responsive layout manager
  useEffect(() => {
    const eventEmitter = new EventEmitter();
    const manager = new ResponsiveLayoutManager(eventEmitter, {
      enableAutoLayout: true,
      enableMobileSupport: true,
      enableFlexibleSizing: true,
      animationDuration: 200,
    });

    // Listen for layout mode changes
    eventEmitter.on("layout:mode:change", ({ mode }) => {
      setLayoutMode(mode);
      onLayoutChange?.(mode);
    });

    // Listen for breakpoint changes
    eventEmitter.on(
      "layout:breakpoint:change",
      ({ old: oldBreakpoint, new: newBreakpoint }) => {
        console.log(
          `Breakpoint changed from ${oldBreakpoint} to ${newBreakpoint}`,
        );
      },
    );

    // Set initial terminal size
    manager.handleTerminalResize(terminalSize.columns, terminalSize.rows);

    setLayoutManager(manager);

    return () => {
      eventEmitter.removeAllListeners();
    };
  }, []);

  // Update layout manager when terminal size changes
  useEffect(() => {
    if (layoutManager) {
      layoutManager.handleTerminalResize(
        terminalSize.columns,
        terminalSize.rows,
      );
    }
  }, [terminalSize, layoutManager]);

  // Provide responsive context to children
  return (
    <ResponsiveContainer
      minWidth={60}
      minHeight={10}
      adaptivePadding={true}
      adaptiveBorder={true}
      onResize={(size) => {
        // Additional resize handling if needed
        console.log("Terminal resized:", size);
      }}
    >
      {(mode, size) => (
        <Box flexDirection="column" width={size.columns} height={size.rows}>
          {children}
        </Box>
      )}
    </ResponsiveContainer>
  );
};

export default ResponsiveApp;
