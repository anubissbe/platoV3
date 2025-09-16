import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, AppBar, Toolbar, Typography, Drawer, List, ListItem, ListItemIcon, ListItemText, IconButton, Badge } from '@mui/material';
import { Dashboard, Timeline, Security, Speed, People, Settings, Notifications, Menu as MenuIcon } from '@mui/icons-material';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import io from 'socket.io-client';

import DashboardOverview from './components/DashboardOverview';
import PerformanceMetrics from './components/PerformanceMetrics';
import CommandAnalytics from './components/CommandAnalytics';
import SystemHealth from './components/SystemHealth';
import UserActivity from './components/UserActivity';
import SecurityMonitoring from './components/SecurityMonitoring';
import AlertsPanel from './components/AlertsPanel';
import SettingsPanel from './components/SettingsPanel';
import { MetricsProvider } from './contexts/MetricsContext';
import { AlertProvider } from './contexts/AlertContext';
import { WebSocketProvider } from './contexts/WebSocketContext';

// Create theme with Plato TUI branding
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00d4aa',
      light: '#4effd2',
      dark: '#00a37a',
      contrastText: '#ffffff'
    },
    secondary: {
      main: '#ff6b35',
      light: '#ff9c6b',
      dark: '#c73900',
      contrastText: '#ffffff'
    },
    background: {
      default: '#0a0a0a',
      paper: '#1a1a1a'
    },
    text: {
      primary: '#ffffff',
      secondary: '#cccccc'
    },
    error: {
      main: '#f44336'
    },
    warning: {
      main: '#ff9800'
    },
    info: {
      main: '#2196f3'
    },
    success: {
      main: '#4caf50'
    }
  },
  typography: {
    fontFamily: '"JetBrains Mono", "Roboto Mono", monospace',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 600
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 500
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 500
    },
    body1: {
      fontSize: '0.875rem'
    },
    body2: {
      fontSize: '0.75rem'
    }
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid #333'
        }
      }
    }
  }
});

// Query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 30000, // Refetch every 30 seconds
      retry: 2,
      staleTime: 5 * 60 * 1000 // 5 minutes
    }
  }
});

// Navigation items
const navigationItems = [
  { id: 'overview', label: 'Overview', icon: <Dashboard />, path: '/overview' },
  { id: 'performance', label: 'Performance', icon: <Speed />, path: '/performance' },
  { id: 'commands', label: 'Command Analytics', icon: <Timeline />, path: '/commands' },
  { id: 'health', label: 'System Health', icon: <Security />, path: '/health' },
  { id: 'users', label: 'User Activity', icon: <People />, path: '/users' },
  { id: 'security', label: 'Security', icon: <Security />, path: '/security' },
  { id: 'alerts', label: 'Alerts', icon: <Notifications />, path: '/alerts' },
  { id: 'settings', label: 'Settings', icon: <Settings />, path: '/settings' }
];

const DRAWER_WIDTH = 280;

function App() {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [alertCount, setAlertCount] = useState(0);
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    // Initialize WebSocket connection
    const newSocket = io(process.env.REACT_APP_WEBSOCKET_URL || 'ws://localhost:8719');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to Plato TUI monitoring server');
    });

    newSocket.on('alert', (alert: any) => {
      setAlertCount(prev => prev + 1);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from monitoring server');
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <WebSocketProvider socket={socket}>
          <MetricsProvider>
            <AlertProvider>
              <Router>
                <Box sx={{ display: 'flex', height: '100vh' }}>
                  {/* App Bar */}
                  <AppBar
                    position="fixed"
                    sx={{
                      width: drawerOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%',
                      ml: drawerOpen ? `${DRAWER_WIDTH}px` : 0,
                      transition: 'width 225ms cubic-bezier(0.4, 0, 0.6, 1) 0ms'
                    }}
                  >
                    <Toolbar>
                      <IconButton
                        color="inherit"
                        aria-label="toggle drawer"
                        edge="start"
                        onClick={handleDrawerToggle}
                        sx={{ mr: 2 }}
                      >
                        <MenuIcon />
                      </IconButton>
                      <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Plato TUI Enterprise Monitoring
                      </Typography>
                      <IconButton color="inherit">
                        <Badge badgeContent={alertCount} color="error">
                          <Notifications />
                        </Badge>
                      </IconButton>
                    </Toolbar>
                  </AppBar>

                  {/* Drawer */}
                  <Drawer
                    variant="persistent"
                    open={drawerOpen}
                    sx={{
                      width: DRAWER_WIDTH,
                      flexShrink: 0,
                      '& .MuiDrawer-paper': {
                        width: DRAWER_WIDTH,
                        boxSizing: 'border-box',
                        backgroundColor: '#0a0a0a',
                        borderRight: '1px solid #333'
                      }
                    }}
                  >
                    <Toolbar />
                    <List>
                      {navigationItems.map((item) => (
                        <ListItem
                          button
                          key={item.id}
                          component="a"
                          href={`#${item.path}`}
                          sx={{
                            '&:hover': {
                              backgroundColor: '#333'
                            }
                          }}
                        >
                          <ListItemIcon sx={{ color: theme.palette.primary.main }}>
                            {item.icon}
                          </ListItemIcon>
                          <ListItemText primary={item.label} />
                        </ListItem>
                      ))}
                    </List>
                  </Drawer>

                  {/* Main Content */}
                  <Box
                    component="main"
                    sx={{
                      flexGrow: 1,
                      p: 3,
                      mt: 8,
                      ml: drawerOpen ? 0 : `-${DRAWER_WIDTH}px`,
                      transition: 'margin 225ms cubic-bezier(0.4, 0, 0.6, 1) 0ms',
                      backgroundColor: '#0a0a0a',
                      minHeight: 'calc(100vh - 64px)',
                      overflow: 'auto'
                    }}
                  >
                    <Routes>
                      <Route path="/" element={<Navigate to="/overview" replace />} />
                      <Route path="/overview" element={<DashboardOverview />} />
                      <Route path="/performance" element={<PerformanceMetrics />} />
                      <Route path="/commands" element={<CommandAnalytics />} />
                      <Route path="/health" element={<SystemHealth />} />
                      <Route path="/users" element={<UserActivity />} />
                      <Route path="/security" element={<SecurityMonitoring />} />
                      <Route path="/alerts" element={<AlertsPanel />} />
                      <Route path="/settings" element={<SettingsPanel />} />
                    </Routes>
                  </Box>
                </Box>
              </Router>
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#1a1a1a',
                    color: '#ffffff',
                    border: '1px solid #333'
                  }
                }}
              />
            </AlertProvider>
          </MetricsProvider>
        </WebSocketProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;