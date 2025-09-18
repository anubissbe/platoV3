import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
  IconButton
} from '@mui/material';
import {
  Speed,
  Memory,
  Storage,
  NetworkCheck,
  People,
  Security,
  Timeline,
  Refresh
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useQuery } from 'react-query';
import { motion } from 'framer-motion';

import { useMetrics } from '../hooks/useMetrics';
import { formatBytes, formatDuration, formatNumber } from '../utils/formatters';
import MetricCard from './common/MetricCard';
import ChartCard from './common/ChartCard';

const DashboardOverview: React.FC = () => {
  const { data: systemMetrics, refetch: refetchSystem } = useQuery('systemMetrics', () =>
    fetch('/api/metrics/system').then(res => res.json())
  );

  const { data: performanceMetrics } = useQuery('performanceMetrics', () =>
    fetch('/api/metrics/performance').then(res => res.json())
  );

  const { data: userMetrics } = useQuery('userMetrics', () =>
    fetch('/api/metrics/users').then(res => res.json())
  );

  const { data: commandMetrics } = useQuery('commandMetrics', () =>
    fetch('/api/metrics/commands').then(res => res.json())
  );

  const { realTimeMetrics } = useMetrics();

  // Mock data for demonstration
  const mockSystemMetrics = {
    cpu: { usage: 45, cores: 8, load: [0.8, 1.2, 0.9] },
    memory: { used: 6.4, total: 16, percent: 40 },
    disk: { used: 120, total: 500, percent: 24 },
    network: { in: 1.2, out: 0.8, connections: 45 }
  };

  const mockPerformanceData = [
    { time: '00:00', responseTime: 120, throughput: 450, errors: 2 },
    { time: '00:30', responseTime: 135, throughput: 520, errors: 1 },
    { time: '01:00', responseTime: 98, throughput: 680, errors: 0 },
    { time: '01:30', responseTime: 142, throughput: 720, errors: 3 },
    { time: '02:00', responseTime: 156, throughput: 620, errors: 1 }
  ];

  const mockUserActivity = [
    { time: '00:00', activeUsers: 25, sessions: 45, commands: 120 },
    { time: '00:30', activeUsers: 32, sessions: 58, commands: 180 },
    { time: '01:00', activeUsers: 48, sessions: 72, commands: 240 },
    { time: '01:30', activeUsers: 56, sessions: 85, commands: 310 },
    { time: '02:00', activeUsers: 42, sessions: 68, commands: 220 }
  ];

  const handleRefresh = () => {
    refetchSystem();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          System Overview
        </Typography>
        <IconButton onClick={handleRefresh} sx={{ color: 'primary.main' }}>
          <Refresh />
        </IconButton>
      </Box>

      {/* Key Metrics Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="CPU Usage"
            value={`${mockSystemMetrics.cpu.usage}%`}
            icon={<Speed />}
            color="primary"
            trend={-2.3}
            subtitle={`${mockSystemMetrics.cpu.cores} cores`}
          >
            <LinearProgress
              variant="determinate"
              value={mockSystemMetrics.cpu.usage}
              sx={{ mt: 1, height: 6, borderRadius: 3 }}
            />
          </MetricCard>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Memory Usage"
            value={formatBytes(mockSystemMetrics.memory.used * 1024 * 1024 * 1024)}
            icon={<Memory />}
            color="secondary"
            trend={1.2}
            subtitle={`${formatBytes(mockSystemMetrics.memory.total * 1024 * 1024 * 1024)} total`}
          >
            <LinearProgress
              variant="determinate"
              value={mockSystemMetrics.memory.percent}
              sx={{ mt: 1, height: 6, borderRadius: 3 }}
            />
          </MetricCard>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Disk Usage"
            value={formatBytes(mockSystemMetrics.disk.used * 1024 * 1024 * 1024)}
            icon={<Storage />}
            color="info"
            trend={0.5}
            subtitle={`${formatBytes(mockSystemMetrics.disk.total * 1024 * 1024 * 1024)} total`}
          >
            <LinearProgress
              variant="determinate"
              value={mockSystemMetrics.disk.percent}
              sx={{ mt: 1, height: 6, borderRadius: 3 }}
            />
          </MetricCard>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Network"
            value={`${mockSystemMetrics.network.connections}`}
            icon={<NetworkCheck />}
            color="success"
            trend={5.1}
            subtitle="connections"
          >
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Chip size="small" label={`↓ ${formatBytes(mockSystemMetrics.network.in * 1024 * 1024)}/s`} />
              <Chip size="small" label={`↑ ${formatBytes(mockSystemMetrics.network.out * 1024 * 1024)}/s`} />
            </Box>
          </MetricCard>
        </Grid>
      </Grid>

      {/* Performance Charts Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <ChartCard title="System Performance" subtitle="Response time and throughput over time">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mockPerformanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#666" />
                <YAxis yAxisId="left" stroke="#666" />
                <YAxis yAxisId="right" orientation="right" stroke="#666" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: 4
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="responseTime"
                  stroke="#00d4aa"
                  strokeWidth={2}
                  name="Response Time (ms)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="throughput"
                  stroke="#ff6b35"
                  strokeWidth={2}
                  name="Throughput (req/min)"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                System Status
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Plato TUI Service</Typography>
                  <Chip size="small" label="Healthy" color="success" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Database</Typography>
                  <Chip size="small" label="Connected" color="success" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Redis Cache</Typography>
                  <Chip size="small" label="Healthy" color="success" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">MCP Servers</Typography>
                  <Chip size="small" label="3/3 Online" color="success" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Load Balancer</Typography>
                  <Chip size="small" label="Active" color="success" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Monitoring</Typography>
                  <Chip size="small" label="Recording" color="primary" />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* User Activity and Command Analytics Row */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <ChartCard title="User Activity" subtitle="Active users, sessions, and command usage">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={mockUserActivity}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#00d4aa" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff6b35" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ff6b35" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: 4
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="activeUsers"
                  stackId="1"
                  stroke="#00d4aa"
                  fillOpacity={1}
                  fill="url(#colorUsers)"
                  name="Active Users"
                />
                <Area
                  type="monotone"
                  dataKey="sessions"
                  stackId="2"
                  stroke="#ff6b35"
                  fillOpacity={1}
                  fill="url(#colorSessions)"
                  name="Sessions"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Quick Stats
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Commands Today
                  </Typography>
                  <Typography variant="h4" color="primary.main">
                    2,847
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Active Sessions
                  </Typography>
                  <Typography variant="h4" color="secondary.main">
                    56
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Avg Response Time
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    142ms
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Error Rate
                  </Typography>
                  <Typography variant="h4" color="warning.main">
                    0.12%
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </motion.div>
  );
};

export default DashboardOverview;