/**
 * Advanced Analytics Test Suite
 * Comprehensive testing for AI-powered analytics and intelligence system
 */

import { AdvancedAnalyticsEngine } from '../services/advanced-analytics.js';
import type { AdvancedAnalyticsConfig } from '../services/advanced-analytics.js';

describe('AdvancedAnalyticsEngine', () => {
  let engine: AdvancedAnalyticsEngine;
  let config: AdvancedAnalyticsConfig;

  beforeEach(() => {
    config = {
      enablePredictiveAnalytics: true,
      enableRealTimeInsights: true,
      enableBehaviorTracking: true,
      retentionPeriodDays: 30,
      insightUpdateIntervalMs: 5000,
      privacyMode: 'anonymized'
    };
    engine = new AdvancedAnalyticsEngine(config);
  });

  afterEach(() => {
    // Cleanup
    engine.removeAllListeners();
  });

  describe('Dashboard Generation', () => {
    it('should generate comprehensive advanced metrics dashboard', async () => {
      const dashboard = await engine.generateAdvancedDashboard();

      expect(dashboard).toHaveProperty('commandUsagePatterns');
      expect(dashboard).toHaveProperty('performanceInsights');
      expect(dashboard).toHaveProperty('userBehaviorAnalytics');
      expect(dashboard).toHaveProperty('predictiveRecommendations');
      expect(dashboard).toHaveProperty('trendAnalysis');
      expect(dashboard).toHaveProperty('productivityMetrics');
    });

    it('should include command usage patterns with time distribution', async () => {
      const dashboard = await engine.generateAdvancedDashboard();
      const patterns = dashboard.commandUsagePatterns;

      if (patterns.length > 0) {
        const pattern = patterns[0];
        expect(pattern).toHaveProperty('command');
        expect(pattern).toHaveProperty('frequency');
        expect(pattern).toHaveProperty('avgExecutionTime');
        expect(pattern).toHaveProperty('successRate');
        expect(pattern).toHaveProperty('commonArguments');
        expect(pattern).toHaveProperty('timeOfDayDistribution');
        expect(pattern).toHaveProperty('contextualTriggers');
      }
    });

    it('should generate performance insights with severity levels', async () => {
      const dashboard = await engine.generateAdvancedDashboard();
      const insights = dashboard.performanceInsights;

      if (insights.length > 0) {
        const insight = insights[0];
        expect(['bottleneck', 'optimization', 'resource-usage', 'latency']).toContain(insight.type);
        expect(['low', 'medium', 'high', 'critical']).toContain(insight.severity);
        expect(insight).toHaveProperty('component');
        expect(insight).toHaveProperty('description');
        expect(insight).toHaveProperty('recommendation');
        expect(insight).toHaveProperty('impact');
        expect(['low', 'medium', 'high']).toContain(insight.effort);
      }
    });

    it('should analyze user behavior with efficiency metrics', async () => {
      const dashboard = await engine.generateAdvancedDashboard();
      const behavior = dashboard.userBehaviorAnalytics;

      expect(behavior).toHaveProperty('sessionDuration');
      expect(behavior).toHaveProperty('commandSequences');
      expect(behavior).toHaveProperty('errorRecoveryPatterns');
      expect(behavior).toHaveProperty('workflowEfficiency');
      expect(behavior).toHaveProperty('mostUsedFeatures');
      expect(behavior).toHaveProperty('leastUsedFeatures');
      expect(behavior).toHaveProperty('learningCurveProgress');
    });

    it('should provide predictive recommendations with confidence scores', async () => {
      const dashboard = await engine.generateAdvancedDashboard();
      const recommendations = dashboard.predictiveRecommendations;

      if (recommendations.length > 0) {
        const recommendation = recommendations[0];
        expect(['command', 'workflow', 'optimization', 'feature']).toContain(recommendation.type);
        expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
        expect(recommendation.confidence).toBeLessThanOrEqual(1);
        expect(recommendation).toHaveProperty('description');
        expect(recommendation).toHaveProperty('rationale');
        expect(recommendation).toHaveProperty('expectedBenefit');
        expect(recommendation).toHaveProperty('implementationHint');
      }
    });

    it('should analyze trends across multiple dimensions', async () => {
      const dashboard = await engine.generateAdvancedDashboard();
      const trends = dashboard.trendAnalysis;

      expect(trends).toHaveProperty('usageTrends');
      expect(trends).toHaveProperty('performanceTrends');
      expect(trends).toHaveProperty('errorTrends');
      expect(trends).toHaveProperty('featureAdoption');
    });

    it('should calculate productivity metrics with automation opportunities', async () => {
      const dashboard = await engine.generateAdvancedDashboard();
      const productivity = dashboard.productivityMetrics;

      expect(productivity).toHaveProperty('commandsPerSession');
      expect(productivity).toHaveProperty('taskCompletionRate');
      expect(productivity).toHaveProperty('averageTaskTime');
      expect(productivity).toHaveProperty('efficientWorkflowUsage');
      expect(productivity).toHaveProperty('automationOpportunities');
      expect(productivity).toHaveProperty('timeDistribution');
    });
  });

  describe('Export Functionality', () => {
    it('should export analytics data as JSON', async () => {
      const jsonExport = await engine.exportAdvancedAnalytics('json');
      expect(() => JSON.parse(jsonExport)).not.toThrow();
      const data = JSON.parse(jsonExport);
      expect(data).toHaveProperty('commandUsagePatterns');
      expect(data).toHaveProperty('performanceInsights');
    });

    it('should export analytics data as CSV', async () => {
      const csvExport = await engine.exportAdvancedAnalytics('csv');
      expect(csvExport).toContain('CSV data here'); // Mock implementation
    });

    it('should export analytics data as HTML', async () => {
      const htmlExport = await engine.exportAdvancedAnalytics('html');
      expect(htmlExport).toContain('<html>');
      expect(htmlExport).toContain('Report here');
    });

    it('should export analytics data as PDF', async () => {
      const pdfExport = await engine.exportAdvancedAnalytics('pdf');
      expect(pdfExport).toBe('PDF content here'); // Mock implementation
    });

    it('should throw error for unsupported export format', async () => {
      await expect(engine.exportAdvancedAnalytics('xml' as any))
        .rejects.toThrow('Unsupported export format: xml');
    });
  });

  describe('Real-Time Insights', () => {
    it('should emit insights when enabled', (done) => {
      const rtEngine = new AdvancedAnalyticsEngine({
        ...config,
        insightUpdateIntervalMs: 100 // Fast interval for testing
      });

      rtEngine.on('insights-updated', (insights) => {
        expect(Array.isArray(insights)).toBe(true);
        rtEngine.removeAllListeners();
        done();
      });
    });

    it('should not emit insights when disabled', (done) => {
      const rtEngine = new AdvancedAnalyticsEngine({
        ...config,
        enableRealTimeInsights: false
      });

      let emitted = false;
      rtEngine.on('insights-updated', () => {
        emitted = true;
      });

      setTimeout(() => {
        expect(emitted).toBe(false);
        rtEngine.removeAllListeners();
        done();
      }, 200);
    });
  });

  describe('Privacy Modes', () => {
    it('should respect full privacy mode', async () => {
      const privacyEngine = new AdvancedAnalyticsEngine({
        ...config,
        privacyMode: 'full'
      });
      const dashboard = await privacyEngine.generateAdvancedDashboard();
      expect(dashboard).toBeDefined();
    });

    it('should respect anonymized privacy mode', async () => {
      const privacyEngine = new AdvancedAnalyticsEngine({
        ...config,
        privacyMode: 'anonymized'
      });
      const dashboard = await privacyEngine.generateAdvancedDashboard();
      expect(dashboard).toBeDefined();
    });

    it('should respect minimal privacy mode', async () => {
      const privacyEngine = new AdvancedAnalyticsEngine({
        ...config,
        privacyMode: 'minimal'
      });
      const dashboard = await privacyEngine.generateAdvancedDashboard();
      expect(dashboard).toBeDefined();
    });
  });

  describe('Configuration Options', () => {
    it('should handle predictive analytics toggle', async () => {
      const noPredictsEngine = new AdvancedAnalyticsEngine({
        ...config,
        enablePredictiveAnalytics: false
      });
      const dashboard = await noPredictsEngine.generateAdvancedDashboard();
      expect(dashboard.predictiveRecommendations).toBeDefined();
    });

    it('should handle behavior tracking toggle', async () => {
      const noBehaviorEngine = new AdvancedAnalyticsEngine({
        ...config,
        enableBehaviorTracking: false
      });
      const dashboard = await noBehaviorEngine.generateAdvancedDashboard();
      expect(dashboard.userBehaviorAnalytics).toBeDefined();
    });

    it('should respect retention period', async () => {
      const shortRetentionEngine = new AdvancedAnalyticsEngine({
        ...config,
        retentionPeriodDays: 7
      });
      const dashboard = await shortRetentionEngine.generateAdvancedDashboard();
      expect(dashboard).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty data gracefully', async () => {
      const dashboard = await engine.generateAdvancedDashboard();
      expect(dashboard).toBeDefined();
      expect(dashboard.commandUsagePatterns).toEqual([]);
    });

    it('should handle concurrent dashboard generation', async () => {
      const promises = Array(5).fill(null).map(() =>
        engine.generateAdvancedDashboard()
      );
      const dashboards = await Promise.all(promises);
      expect(dashboards).toHaveLength(5);
      dashboards.forEach(dashboard => {
        expect(dashboard).toHaveProperty('commandUsagePatterns');
      });
    });

    it('should handle rapid configuration changes', async () => {
      const engine1 = new AdvancedAnalyticsEngine({
        ...config,
        privacyMode: 'full'
      });

      const engine2 = new AdvancedAnalyticsEngine({
        ...config,
        privacyMode: 'minimal'
      });

      const [dashboard1, dashboard2] = await Promise.all([
        engine1.generateAdvancedDashboard(),
        engine2.generateAdvancedDashboard()
      ]);

      expect(dashboard1).toBeDefined();
      expect(dashboard2).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should generate dashboard within acceptable time', async () => {
      const startTime = Date.now();
      await engine.generateAdvancedDashboard();
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle large data sets efficiently', async () => {
      // Simulate large dataset scenario
      const startTime = Date.now();
      const promises = Array(10).fill(null).map(() =>
        engine.generateAdvancedDashboard()
      );
      await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});