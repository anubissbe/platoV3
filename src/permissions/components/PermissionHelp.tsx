import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

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
    { title: "Quick Start", key: "quickstart" },
    { title: "Profiles", key: "profiles" },
    { title: "Rules", key: "rules" },
    { title: "Commands", key: "commands" },
    { title: "Keyboard Shortcuts", key: "shortcuts" },
    { title: "Troubleshooting", key: "troubleshooting" },
  ];

  useInput((input, key) => {
    if (!visible) return;

    if (key.escape && onClose) {
      onClose();
    } else if (key.upArrow) {
      setSelectedSection(Math.max(0, selectedSection - 1));
    } else if (key.downArrow) {
      setSelectedSection(Math.min(sections.length - 1, selectedSection + 1));
    } else if (input >= "1" && input <= "6") {
      setSelectedSection(parseInt(input) - 1);
    }
  });

  if (!visible) return null;

  const renderQuickStart = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Quick Start Guide
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Getting Started:</Text>
        <Box paddingLeft={2}>
          <Text>1. The permission system protects your codebase</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>2. Profiles control what actions are allowed</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>3. Rules define specific permission patterns</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>4. All actions are logged for audit purposes</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Default Behavior:</Text>
        <Box paddingLeft={2}>
          <Text>• Development profile is active by default</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Most operations are allowed with prompts</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Critical paths are always protected</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• You can switch profiles with Ctrl+P</Text>
        </Box>
      </Box>
    </Box>
  );

  const renderProfiles = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Profile System
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Available Profiles:</Text>
        <Box paddingLeft={2}>
          <Text>
            <Text color="green">• Development</Text> - Relaxed permissions for
            development
          </Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>
            <Text color="yellow">• Staging</Text> - Moderate restrictions for
            testing
          </Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>
            <Text color="red">• Production</Text> - Strict permissions for
            production
          </Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>
            <Text color="blue">• Testing</Text> - Optimized for test execution
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Profile Switching:</Text>
        <Box paddingLeft={2}>
          <Text>• Automatic based on git branch</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Manual with /permissions profile command</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Quick switch with Ctrl+P shortcut</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Environment variable override</Text>
        </Box>
      </Box>
    </Box>
  );

  const renderRules = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Permission Rules
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Rule Structure:</Text>
        <Box paddingLeft={2}>
          <Text>• Pattern: File path or glob pattern</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Action: allow, deny, or prompt</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Priority: Higher numbers win conflicts</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Expiration: Optional time-based rules</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Rule Evaluation:</Text>
        <Box paddingLeft={2}>
          <Text>1. Check profile-specific rules first</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>2. Fall back to global rules</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>3. Apply profile defaults</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>4. Highest priority rule wins</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Special Patterns:</Text>
        <Box paddingLeft={2}>
          <Text>• ** - Match any directories</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• * - Match any file in directory</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• ! - Negate pattern (exception)</Text>
        </Box>
      </Box>
    </Box>
  );

  const renderCommands = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Permission Commands
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Profile Management:</Text>
        <Box paddingLeft={2}>
          <Text>• /permissions profile list - Show all profiles</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• /permissions profile &lt;name&gt; - Switch profile</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• /permissions profile create - Create new profile</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Rule Management:</Text>
        <Box paddingLeft={2}>
          <Text>• /permissions rule add - Add new rule</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• /permissions rule remove - Remove rule</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• /permissions rule list - Show all rules</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Audit & Monitoring:</Text>
        <Box paddingLeft={2}>
          <Text>• /permissions audit - View audit log</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• /permissions stats - Show statistics</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• /permissions export - Export audit data</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>System Control:</Text>
        <Box paddingLeft={2}>
          <Text>• /permissions reload - Reload configuration</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• /permissions reset - Reset to defaults</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• /permissions emergency - Emergency lockdown</Text>
        </Box>
      </Box>
    </Box>
  );

  const renderShortcuts = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Keyboard Shortcuts
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Global Shortcuts:</Text>
        <Box paddingLeft={2}>
          <Text>• Ctrl+P - Switch profile</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Ctrl+D - Open dashboard</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Ctrl+A - View audit log</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Ctrl+R - Reload configuration</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Ctrl+S - Toggle safe mode</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Ctrl+E - Emergency stop</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Ctrl+H - Toggle help</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>In Permission Prompts:</Text>
        <Box paddingLeft={2}>
          <Text>• Y - Allow once</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• N - Deny once</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Shift+Y - Always allow</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Shift+N - Always deny</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• I - Show more info</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• ESC - Cancel (deny)</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>In Dashboard:</Text>
        <Box paddingLeft={2}>
          <Text>• ← → - Navigate tabs</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• 1-6 - Jump to tab</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• ↑ ↓ - Scroll content</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• ESC - Close dashboard</Text>
        </Box>
      </Box>
    </Box>
  );

  const renderTroubleshooting = () => (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Troubleshooting
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Common Issues:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text bold>Permission Denied Unexpectedly:</Text>
          <Box paddingLeft={4}>
            <Text>• Check current profile (Ctrl+P)</Text>
          </Box>
          <Box paddingLeft={4}>
            <Text>• Review active rules (/permissions rule list)</Text>
          </Box>
          <Box paddingLeft={4}>
            <Text>• Check audit log for details (Ctrl+A)</Text>
          </Box>
        </Box>
        <Box marginTop={0.5} marginLeft={2} flexDirection="column">
          <Text bold>Profile Not Switching:</Text>
          <Box paddingLeft={4}>
            <Text>• Verify profile exists</Text>
          </Box>
          <Box paddingLeft={4}>
            <Text>• Check for syntax errors in config</Text>
          </Box>
          <Box paddingLeft={4}>
            <Text>• Try manual reload (Ctrl+R)</Text>
          </Box>
        </Box>
        <Box marginTop={0.5} marginLeft={2} flexDirection="column">
          <Text bold>Performance Issues:</Text>
          <Box paddingLeft={4}>
            <Text>• Check cache hit rate in stats</Text>
          </Box>
          <Box paddingLeft={4}>
            <Text>• Reduce audit log retention</Text>
          </Box>
          <Box paddingLeft={4}>
            <Text>• Optimize rule patterns</Text>
          </Box>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Recovery Options:</Text>
        <Box paddingLeft={2}>
          <Text>• /permissions reset - Reset to defaults</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• /permissions emergency off - Disable all restrictions</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text>• Delete .plato/permissions.yml - Full reset</Text>
        </Box>
      </Box>
    </Box>
  );

  const renderContent = () => {
    switch (sections[selectedSection].key) {
      case "quickstart":
        return renderQuickStart();
      case "profiles":
        return renderProfiles();
      case "rules":
        return renderRules();
      case "commands":
        return renderCommands();
      case "shortcuts":
        return renderShortcuts();
      case "troubleshooting":
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
              color={selectedSection === index ? "cyan" : "white"}
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
