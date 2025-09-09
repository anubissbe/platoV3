import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface PermissionHelpProps {
  visible?: boolean;
  onClose?: () => void;
}

/**
 * Comprehensive help system for the permission system
 * Provides inline documentation and guidance
 */
export const PermissionHelp: React.FC<PermissionHelpProps> = ({
  visible = false,
  onClose,
}) => {
  const [selectedSection, setSelectedSection] = useState(0);

  const sections = [
    { title: 'Quick Start', key: 'quickstart' },
    { title: 'Profiles', key: 'profiles' },
    { title: 'Rules', key: 'rules' },
    { title: 'Commands', key: 'commands' },
    { title: 'Keyboard Shortcuts', key: 'shortcuts' },
    { title: 'Troubleshooting', key: 'troubleshooting' },
  ];

  useInput((input, key) => {
    if (!visible) return;

    if (key.escape && onClose) {
      onClose();
    } else if (key.upArrow) {
      setSelectedSection(Math.max(0, selectedSection - 1));
    } else if (key.downArrow) {
      setSelectedSection(Math.min(sections.length - 1, selectedSection + 1));
    } else if (input >= '1' && input <= '6') {
      setSelectedSection(parseInt(input) - 1);
    }
  });

  if (!visible) return null;

  const renderQuickStart = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">Quick Start Guide</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Getting Started:</Text>
        <Text marginLeft={2}>1. The permission system protects your codebase</Text>
        <Text marginLeft={2}>2. Profiles control what actions are allowed</Text>
        <Text marginLeft={2}>3. Rules define specific permission patterns</Text>
        <Text marginLeft={2}>4. All actions are logged for audit purposes</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Default Behavior:</Text>
        <Text marginLeft={2}>• Development profile is active by default</Text>
        <Text marginLeft={2}>• Most operations are allowed with prompts</Text>
        <Text marginLeft={2}>• Critical paths are always protected</Text>
        <Text marginLeft={2}>• You can switch profiles with Ctrl+P</Text>
      </Box>
    </Box>
  );

  const renderProfiles = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">Profile System</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Available Profiles:</Text>
        <Text marginLeft={2}>
          <Text color="green">• Development</Text> - Relaxed permissions for development
        </Text>
        <Text marginLeft={2}>
          <Text color="yellow">• Staging</Text> - Moderate restrictions for testing
        </Text>
        <Text marginLeft={2}>
          <Text color="red">• Production</Text> - Strict permissions for production
        </Text>
        <Text marginLeft={2}>
          <Text color="blue">• Testing</Text> - Optimized for test execution
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Profile Switching:</Text>
        <Text marginLeft={2}>• Automatic based on git branch</Text>
        <Text marginLeft={2}>• Manual with /permissions profile command</Text>
        <Text marginLeft={2}>• Quick switch with Ctrl+P shortcut</Text>
        <Text marginLeft={2}>• Environment variable override</Text>
      </Box>
    </Box>
  );

  const renderRules = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">Permission Rules</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Rule Structure:</Text>
        <Text marginLeft={2}>• Pattern: File path or glob pattern</Text>
        <Text marginLeft={2}>• Action: allow, deny, or prompt</Text>
        <Text marginLeft={2}>• Priority: Higher numbers win conflicts</Text>
        <Text marginLeft={2}>• Expiration: Optional time-based rules</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Rule Evaluation:</Text>
        <Text marginLeft={2}>1. Check profile-specific rules first</Text>
        <Text marginLeft={2}>2. Fall back to global rules</Text>
        <Text marginLeft={2}>3. Apply profile defaults</Text>
        <Text marginLeft={2}>4. Highest priority rule wins</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Special Patterns:</Text>
        <Text marginLeft={2}>• ** - Match any directories</Text>
        <Text marginLeft={2}>• * - Match any file in directory</Text>
        <Text marginLeft={2}>• ! - Negate pattern (exception)</Text>
      </Box>
    </Box>
  );

  const renderCommands = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">Permission Commands</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Profile Management:</Text>
        <Text marginLeft={2}>• /permissions profile list - Show all profiles</Text>
        <Text marginLeft={2}>• /permissions profile &lt;name&gt; - Switch profile</Text>
        <Text marginLeft={2}>• /permissions profile create - Create new profile</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Rule Management:</Text>
        <Text marginLeft={2}>• /permissions rule add - Add new rule</Text>
        <Text marginLeft={2}>• /permissions rule remove - Remove rule</Text>
        <Text marginLeft={2}>• /permissions rule list - Show all rules</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Audit & Monitoring:</Text>
        <Text marginLeft={2}>• /permissions audit - View audit log</Text>
        <Text marginLeft={2}>• /permissions stats - Show statistics</Text>
        <Text marginLeft={2}>• /permissions export - Export audit data</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>System Control:</Text>
        <Text marginLeft={2}>• /permissions reload - Reload configuration</Text>
        <Text marginLeft={2}>• /permissions reset - Reset to defaults</Text>
        <Text marginLeft={2}>• /permissions emergency - Emergency lockdown</Text>
      </Box>
    </Box>
  );

  const renderShortcuts = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">Keyboard Shortcuts</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Global Shortcuts:</Text>
        <Text marginLeft={2}>• Ctrl+P - Switch profile</Text>
        <Text marginLeft={2}>• Ctrl+D - Open dashboard</Text>
        <Text marginLeft={2}>• Ctrl+A - View audit log</Text>
        <Text marginLeft={2}>• Ctrl+R - Reload configuration</Text>
        <Text marginLeft={2}>• Ctrl+S - Toggle safe mode</Text>
        <Text marginLeft={2}>• Ctrl+E - Emergency stop</Text>
        <Text marginLeft={2}>• Ctrl+H - Toggle help</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>In Permission Prompts:</Text>
        <Text marginLeft={2}>• Y - Allow once</Text>
        <Text marginLeft={2}>• N - Deny once</Text>
        <Text marginLeft={2}>• Shift+Y - Always allow</Text>
        <Text marginLeft={2}>• Shift+N - Always deny</Text>
        <Text marginLeft={2}>• I - Show more info</Text>
        <Text marginLeft={2}>• ESC - Cancel (deny)</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>In Dashboard:</Text>
        <Text marginLeft={2}>• ← → - Navigate tabs</Text>
        <Text marginLeft={2}>• 1-6 - Jump to tab</Text>
        <Text marginLeft={2}>• ↑ ↓ - Scroll content</Text>
        <Text marginLeft={2}>• ESC - Close dashboard</Text>
      </Box>
    </Box>
  );

  const renderTroubleshooting = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">Troubleshooting</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Common Issues:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text bold>Permission Denied Unexpectedly:</Text>
          <Text marginLeft={4}>• Check current profile (Ctrl+P)</Text>
          <Text marginLeft={4}>• Review active rules (/permissions rule list)</Text>
          <Text marginLeft={4}>• Check audit log for details (Ctrl+A)</Text>
        </Box>
        <Box marginTop={0.5} marginLeft={2} flexDirection="column">
          <Text bold>Profile Not Switching:</Text>
          <Text marginLeft={4}>• Verify profile exists</Text>
          <Text marginLeft={4}>• Check for syntax errors in config</Text>
          <Text marginLeft={4}>• Try manual reload (Ctrl+R)</Text>
        </Box>
        <Box marginTop={0.5} marginLeft={2} flexDirection="column">
          <Text bold>Performance Issues:</Text>
          <Text marginLeft={4}>• Check cache hit rate in stats</Text>
          <Text marginLeft={4}>• Reduce audit log retention</Text>
          <Text marginLeft={4}>• Optimize rule patterns</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Recovery Options:</Text>
        <Text marginLeft={2}>• /permissions reset - Reset to defaults</Text>
        <Text marginLeft={2}>• /permissions emergency off - Disable all restrictions</Text>
        <Text marginLeft={2}>• Delete .plato/permissions.yml - Full reset</Text>
      </Box>
    </Box>
  );

  const renderContent = () => {
    switch (sections[selectedSection].key) {
      case 'quickstart':
        return renderQuickStart();
      case 'profiles':
        return renderProfiles();
      case 'rules':
        return renderRules();
      case 'commands':
        return renderCommands();
      case 'shortcuts':
        return renderShortcuts();
      case 'troubleshooting':
        return renderTroubleshooting();
      default:
        return null;
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      minHeight={25}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          📚 Permission System Help
        </Text>
        <Text dimColor>Press ESC to close</Text>
      </Box>

      <Box marginBottom={1} flexDirection="row">
        {sections.map((section, index) => (
          <Box key={section.key} marginRight={2}>
            <Text
              color={selectedSection === index ? 'cyan' : 'white'}
              bold={selectedSection === index}
            >
              [{index + 1}] {section.title}
            </Text>
          </Box>
        ))}
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        padding={1}
        flexGrow={1}
      >
        {renderContent()}
      </Box>
    </Box>
  );
};