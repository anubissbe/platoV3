import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { AuditLogger } from "../AuditLogger";

export interface PermissionStatistics {
  totalDecisions: number;
  allowed: number;
  denied: number;
  prompted: number;
  elevated: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
  toolUsage: Record<string, number>;
  profileUsage: Record<string, number>;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  timeDistribution: {
    lastHour: number;
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  };
}

export interface PermissionStatisticsProps {
  auditLogger?: AuditLogger;
  refreshInterval?: number;
}

/**
 * Permission statistics component showing system metrics
 */
export const PermissionStatisticsView: React.FC<PermissionStatisticsProps> = ({
  auditLogger,
  refreshInterval = 5000,
}) => {
  const [stats, setStats] = useState<PermissionStatistics>({
    totalDecisions: 0,
    allowed: 0,
    denied: 0,
    prompted: 0,
    elevated: 0,
    cacheHits: 0,
    cacheMisses: 0,
    averageResponseTime: 0,
    toolUsage: {},
    profileUsage: {},
    riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
    timeDistribution: {
      lastHour: 0,
      last24Hours: 0,
      last7Days: 0,
      last30Days: 0,
    },
  });

  useEffect(() => {
    const loadStats = async () => {
      if (!auditLogger) return;

      try {
        const rawStats = await auditLogger.getStatistics();

        // Process raw statistics into display format
        const processedStats: PermissionStatistics = {
          totalDecisions: (rawStats as any).totalEntries || 0,
          allowed: (rawStats as any).actionCounts?.allow || 0,
          denied: (rawStats as any).actionCounts?.deny || 0,
          prompted: (rawStats as any).actionCounts?.confirm || 0,
          elevated: 0, // Not available in AuditStatistics
          cacheHits: 0, // Not available in AuditStatistics
          cacheMisses: 0, // Not available in AuditStatistics
          averageResponseTime: 0, // Not available in AuditStatistics
          toolUsage: (rawStats as any).toolCounts || {},
          profileUsage: {}, // Not available in AuditStatistics
          riskDistribution: {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0,
          },
          timeDistribution: {
            lastHour: 0,
            last24Hours: 0,
            last7Days: 0,
            last30Days: 0,
          },
        };

        setStats(processedStats);
      } catch (error) {
        console.error("Failed to load statistics:", error);
      }
    };

    // Initial load
    loadStats();

    // Set up refresh interval
    const interval = setInterval(loadStats, refreshInterval);

    return () => clearInterval(interval);
  }, [auditLogger, refreshInterval]);

  const getCacheHitRate = () => {
    const total = stats.cacheHits + stats.cacheMisses;
    if (total === 0) return "0%";
    return `${Math.round((stats.cacheHits / total) * 100)}%`;
  };

  const getAllowRate = () => {
    if (stats.totalDecisions === 0) return "0%";
    return `${Math.round((stats.allowed / stats.totalDecisions) * 100)}%`;
  };

  const getDenyRate = () => {
    if (stats.totalDecisions === 0) return "0%";
    return `${Math.round((stats.denied / stats.totalDecisions) * 100)}%`;
  };

  const getTopTools = () => {
    return Object.entries(stats.toolUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  };

  return (
    <Box flexDirection="column">
      <Text bold color="yellow">
        📊 Permission Statistics
      </Text>

      {/* Overview Stats */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Overview</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>Total Decisions: {stats.totalDecisions}</Text>
          <Text color="green">
            Allowed: {stats.allowed} ({getAllowRate()})
          </Text>
          <Text color="red">
            Denied: {stats.denied} ({getDenyRate()})
          </Text>
          <Text color="yellow">Prompted: {stats.prompted}</Text>
          <Text color="cyan">Elevated: {stats.elevated}</Text>
        </Box>
      </Box>

      {/* Performance Stats */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Performance</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>
            Avg Response Time: {stats.averageResponseTime.toFixed(2)}ms
          </Text>
          <Text>Cache Hit Rate: {getCacheHitRate()}</Text>
          <Text dimColor>
            Cache Hits: {stats.cacheHits} | Misses: {stats.cacheMisses}
          </Text>
        </Box>
      </Box>

      {/* Risk Distribution */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Risk Distribution</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color="green">Low Risk: {stats.riskDistribution.low}</Text>
          <Text color="yellow">
            Medium Risk: {stats.riskDistribution.medium}
          </Text>
          <Text color="red">High Risk: {stats.riskDistribution.high}</Text>
          <Text color="magenta">
            Critical Risk: {stats.riskDistribution.critical}
          </Text>
        </Box>
      </Box>

      {/* Time Distribution */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>Activity Timeline</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>Last Hour: {stats.timeDistribution.lastHour}</Text>
          <Text>Last 24 Hours: {stats.timeDistribution.last24Hours}</Text>
          <Text>Last 7 Days: {stats.timeDistribution.last7Days}</Text>
          <Text>Last 30 Days: {stats.timeDistribution.last30Days}</Text>
        </Box>
      </Box>

      {/* Top Tools */}
      {getTopTools().length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Top Tools by Usage</Text>
          <Box marginLeft={2} flexDirection="column">
            {getTopTools().map(([tool, count], index) => (
              <Text key={tool}>
                {index + 1}. {tool}: {count} requests
              </Text>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

/**
 * Compact statistics bar for status line
 */
export const PermissionStatsBar: React.FC<{
  stats?: Partial<PermissionStatistics>;
}> = ({ stats }) => {
  if (!stats) return null;

  return (
    <Box flexDirection="row" gap={2}>
      <Text dimColor>
        Decisions: <Text color="white">{stats.totalDecisions || 0}</Text>
      </Text>
      <Text dimColor>
        Allow: <Text color="green">{stats.allowed || 0}</Text>
      </Text>
      <Text dimColor>
        Deny: <Text color="red">{stats.denied || 0}</Text>
      </Text>
      {stats.cacheHits !== undefined && stats.cacheMisses !== undefined && (
        <Text dimColor>
          Cache: <Text color="cyan">{getCacheHitRate(stats)}</Text>
        </Text>
      )}
    </Box>
  );
};

function getCacheHitRate(stats: Partial<PermissionStatistics>): string {
  const hits = stats.cacheHits || 0;
  const misses = stats.cacheMisses || 0;
  const total = hits + misses;
  if (total === 0) return "0%";
  return `${Math.round((hits / total) * 100)}%`;
}
