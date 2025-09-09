import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ProfileManager } from '../ProfileManager';
import { PermissionManager } from '../PermissionManager.js';

export interface KeyboardShortcutsProps {
  profileManager: ProfileManager;
  permissionManager?: PermissionManager;
  onShowDashboard?: () => void;
  onShowAudit?: () => void;
  onReload?: () => void;
  enabled?: boolean;
}

/**
 * Global keyboard shortcuts for permission system
 * Provides quick access to common permission actions
 */
export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({
  profileManager,
  permissionManager,
  onShowDashboard,
  onShowAudit,
  onReload,
  enabled = true,
}) => {
  useInput((input, key) => {
    if (!enabled) return;

    // Ctrl+P: Switch profile
    if (key.ctrl && input === 'p') {
      handleProfileSwitch();
    }

    // Ctrl+D: Show dashboard
    if (key.ctrl && input === 'd' && onShowDashboard) {
      onShowDashboard();
    }

    // Ctrl+A: Show audit log
    if (key.ctrl && input === 'a' && onShowAudit) {
      onShowAudit();
    }

    // Ctrl+R: Reload configuration
    if (key.ctrl && input === 'r' && onReload) {
      onReload();
    }

    // Ctrl+S: Toggle safe mode
    if (key.ctrl && input === 's' && permissionManager) {
      handleSafeModeToggle();
    }

    // Ctrl+E: Emergency stop (deny all)
    if (key.ctrl && input === 'e' && permissionManager) {
      handleEmergencyStop();
    }
  });

  const handleProfileSwitch = () => {
    const profiles = profileManager.getAllProfiles();
    const currentProfile = profileManager.getCurrentProfile();
    
    if (profiles.length === 0) return;
    
    // Find current profile index
    const currentIndex = currentProfile 
      ? profiles.findIndex((p: any) => p.name === currentProfile.name)
      : -1;
    
    // Switch to next profile (cycle)
    const nextIndex = (currentIndex + 1) % profiles.length;
    const nextProfile = profiles[nextIndex];
    
    profileManager.switchProfile(nextProfile.name);
  };

  const handleSafeModeToggle = () => {
    if (permissionManager) {
      const currentMode = permissionManager.isSafeMode?.() || false;
      permissionManager.setSafeMode?.(!currentMode);
    }
  };

  const handleEmergencyStop = () => {
    if (permissionManager) {
      permissionManager.emergencyStop?.();
    }
  };

  return null; // This component doesn't render anything
};

/**
 * Help overlay showing available keyboard shortcuts
 */
export const KeyboardShortcutsHelp: React.FC<{ visible?: boolean }> = ({ 
  visible = false 
}) => {
  if (!visible) return null;

  const shortcuts = [
    { key: 'Ctrl+P', description: 'Switch profile' },
    { key: 'Ctrl+D', description: 'Show dashboard' },
    { key: 'Ctrl+A', description: 'Show audit log' },
    { key: 'Ctrl+R', description: 'Reload configuration' },
    { key: 'Ctrl+S', description: 'Toggle safe mode' },
    { key: 'Ctrl+E', description: 'Emergency stop (deny all)' },
    { key: 'Ctrl+H', description: 'Show/hide this help' },
    { key: 'ESC', description: 'Close dialogs' },
    { key: 'Y/N', description: 'Allow/Deny in prompts' },
    { key: 'Shift+Y/N', description: 'Always Allow/Deny' },
  ];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      marginTop={1}
    >
      <Text bold color="cyan">
        🎮 Keyboard Shortcuts
      </Text>
      
      <Box marginTop={1} flexDirection="column">
        {shortcuts.map((shortcut, index) => (
          <Box key={index} marginTop={index > 0 ? 0.5 : 0}>
            <Box width={12}>
              <Text color="yellow">{shortcut.key}</Text>
            </Box>
            <Text dimColor>{shortcut.description}</Text>
          </Box>
        ))}
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor italic>
          Press Ctrl+H to hide this help
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Quick action bar for common permission operations
 */
export const QuickActionBar: React.FC<{
  currentProfile?: string;
  safeMode?: boolean;
  onProfileClick?: () => void;
  onDashboardClick?: () => void;
  onAuditClick?: () => void;
}> = ({
  currentProfile = 'Default',
  safeMode = false,
  onProfileClick,
  onDashboardClick,
  onAuditClick,
}) => {
  return (
    <Box flexDirection="row" gap={2}>
      <Box>
        <Text dimColor>Profile: </Text>
        <Text color="cyan" bold>{currentProfile}</Text>
        {onProfileClick && (
          <Text dimColor> (Ctrl+P)</Text>
        )}
      </Box>
      
      {safeMode && (
        <Box>
          <Text color="yellow" bold>
            🛡️ SAFE MODE
          </Text>
        </Box>
      )}
      
      <Box flexGrow={1} />
      
      {onDashboardClick && (
        <Box>
          <Text dimColor>
            [Ctrl+D] Dashboard
          </Text>
        </Box>
      )}
      
      {onAuditClick && (
        <Box>
          <Text dimColor>
            [Ctrl+A] Audit
          </Text>
        </Box>
      )}
    </Box>
  );
};