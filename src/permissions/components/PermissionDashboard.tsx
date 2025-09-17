import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { Profile, Rule, AuditEntry } from "../types";
import { ProfileManager } from "../ProfileManager";
import { AuditLogger } from "../AuditLogger";

interface Tab {
  name: string;
  key: string;
}

interface PermissionDashboardProps {
  profileManager: ProfileManager;
  auditLogger?: AuditLogger;
  onClose?: () => void;
}

export const PermissionDashboard: React.FC<PermissionDashboardProps> = ({
  profileManager,
  auditLogger,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [statistics, setStatistics] = useState<any>({});
  const [recentLogs, setRecentLogs] = useState<AuditEntry[]>([]);

  const tabs: Tab[] = [
    { name: "Overview", key: "overview" },
    { name: "Profiles", key: "profiles" },
    { name: "Rules", key: "rules" },
    { name: "Audit Log", key: "audit" },
    { name: "Statistics", key: "stats" },
    { name: "Help", key: "help" },
  ];

  useEffect(() => {
    // Load initial data
    setProfiles(profileManager.getAllProfiles());
    setCurrentProfile(profileManager.getCurrentProfile());

    // Subscribe to profile changes
    const handleProfileChange = () => {
      setCurrentProfile(profileManager.getCurrentProfile());
    };

    profileManager.on("profileChanged", handleProfileChange);

    return () => {
      profileManager.off("profileChanged", handleProfileChange);
    };
  }, [profileManager]);

  useEffect(() => {
    // Load statistics
    if (auditLogger) {
      auditLogger.getStatistics().then((stats) => {
        setStatistics(stats);
      });

      // Load recent logs
      auditLogger.searchEntries({ limit: 10 }).then((entries: any) => {
        setRecentLogs(entries);
      });
    }
  }, [auditLogger]);

  // Keyboard navigation
  useInput((input, key) => {
    if (key.leftArrow) {
      setActiveTab(Math.max(0, activeTab - 1));
    } else if (key.rightArrow) {
      setActiveTab(Math.min(tabs.length - 1, activeTab + 1));
    } else if (key.escape && onClose) {
      onClose();
    } else if (input >= "1" && input <= "6") {
      setActiveTab(parseInt(input) - 1);
    }
  });

  const renderTabBar = () => (
    <Box marginBottom={1} flexDirection="row">
      {tabs.map((tab, index) => (
        <Box key={tab.key} marginRight={2}>
          <Text
            color={activeTab === index ? "cyan" : "white"}
            bold={activeTab === index}
          >
            [{index + 1}] {tab.name}
          </Text>
        </Box>
      ))}
    </Box>
  );

  const renderOverview = () => (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Permission System Overview
      </Text>
      <Box marginTop={1}>
        <Text>Current Profile: </Text>
        <Text color="cyan" bold>
          {currentProfile?.name || "None"}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>Status: </Text>
        <Text color="green">Active</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Total Profiles: {profiles.length}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Recent Decisions: {recentLogs.length}</Text>
      </Box>
    </Box>
  );

  const renderProfiles = () => (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Profiles
      </Text>
      {profiles.map((profile, index) => (
        <Box key={profile.name} marginTop={1}>
          <Text color={profile === currentProfile ? "cyan" : "white"}>
            {profile === currentProfile ? "▶ " : "  "}
            {profile.name}
          </Text>
          <Box paddingLeft={2}>
            <Text dimColor>{profile.description}</Text>
          </Box>
        </Box>
      ))}
      {profiles.length === 0 && (
        <Box paddingTop={1}>
          <Text dimColor>No profiles configured</Text>
        </Box>
      )}
    </Box>
  );

  const renderRules = () => {
    const rules = currentProfile?.rules || [];
    return (
      <Box flexDirection="column">
        <Text bold color="yellow">
          Rules for {currentProfile?.name || "No Profile"}
        </Text>
        {rules.map((rule, index) => (
          <Box key={index} marginTop={1} flexDirection="column">
            <Text>
              {rule.match.tool ||
                rule.match.path ||
                rule.match.command ||
                "Unknown"}{" "}
              → {rule.action}
            </Text>
            {rule.priority && (
              <Box paddingLeft={1}>
                <Text dimColor>Priority: {rule.priority}</Text>
              </Box>
            )}
          </Box>
        ))}
        {rules.length === 0 && (
          <Box paddingTop={1}>
            <Text dimColor>No rules defined</Text>
          </Box>
        )}
      </Box>
    );
  };

  const renderAuditLog = () => (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Recent Audit Entries
      </Text>
      {recentLogs.map((entry, index) => (
        <Box key={index} marginTop={1} flexDirection="column">
          <Text>
            [{new Date(entry.timestamp).toLocaleTimeString()}]{" "}
            {entry.query.tool} - {entry.result.action}
          </Text>
          {entry.query.path && (
            <Box paddingLeft={1}>
              <Text dimColor>Path: {entry.query.path}</Text>
            </Box>
          )}
        </Box>
      ))}
      {recentLogs.length === 0 && (
        <Box paddingTop={1}>
          <Text dimColor>No recent audit entries</Text>
        </Box>
      )}
    </Box>
  );

  const renderStatistics = () => (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Permission Statistics
      </Text>
      <Box marginTop={1}>
        <Text>Total Decisions: {statistics.totalDecisions || 0}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Allowed: {statistics.allowed || 0}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Denied: {statistics.denied || 0}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Prompted: {statistics.prompted || 0}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Cache Hit Rate: {statistics.cacheHitRate || "0%"}</Text>
      </Box>
    </Box>
  );

  const renderHelp = () => (
    <Box flexDirection="column">
      <Text bold color="yellow">
        Permission System Help
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Keyboard Shortcuts:</Text>
        <Text> ← → - Navigate tabs</Text>
        <Text> 1-6 - Jump to tab</Text>
        <Text> ESC - Close dashboard</Text>
        <Text> Ctrl+P - Switch profile</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Profile Actions:</Text>
        <Text> /permissions profile &lt;name&gt; - Switch profile</Text>
        <Text> /permissions reload - Reload configuration</Text>
        <Text> /permissions audit - View audit log</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Permission Actions:</Text>
        <Text> Allow once - Y</Text>
        <Text> Deny once - N</Text>
        <Text> Always allow - Shift+Y</Text>
        <Text> Always deny - Shift+N</Text>
      </Box>
    </Box>
  );

  const renderContent = () => {
    switch (tabs[activeTab].key) {
      case "overview":
        return renderOverview();
      case "profiles":
        return renderProfiles();
      case "rules":
        return renderRules();
      case "audit":
        return renderAuditLog();
      case "stats":
        return renderStatistics();
      case "help":
        return renderHelp();
      default:
        return null;
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      minHeight={20}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">
          🔒 Permission Dashboard
        </Text>
        <Text dimColor>Press ESC to close</Text>
      </Box>

      {renderTabBar()}

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
