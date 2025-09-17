# Monitoring & Observability Guide

Comprehensive guide for monitoring Plato TUI in enterprise environments with full observability stack.

## Table of Contents

1. [Overview](#overview)
2. [Monitoring Architecture](#monitoring-architecture)
3. [Metrics & KPIs](#metrics--kpis)
4. [Dashboards](#dashboards)
5. [Alerting](#alerting)
6. [Log Management](#log-management)
7. [Distributed Tracing](#distributed-tracing)
8. [Performance Monitoring](#performance-monitoring)

## Overview

The Plato TUI monitoring system provides comprehensive observability across three pillars:
- **Metrics**: Time-series data collection and analysis
- **Logs**: Structured logging with correlation and search
- **Traces**: Distributed request tracing and performance analysis

## Monitoring Architecture

### Components Stack

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Application   │  │   Prometheus    │  │     Grafana     │
│     Metrics     │─▶│   Collection    │─▶│   Dashboards    │
└─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Application    │  │   Logstash      │  │     Kibana      │
│     Logs        │─▶│   Processing    │─▶│   Log Search    │
└─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Application    │  │     Jaeger      │  │  Trace UI       │
│    Traces       │─▶│   Collection    │─▶│   Analysis      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Data Flow

1. **Application Instrumentation**: Metrics, logs, and traces are generated
2. **Collection**: Data is collected by respective agents/collectors
3. **Processing**: Data is processed, enriched, and stored
4. **Visualization**: Data is presented through dashboards and alerts
5. **Action**: Operators respond to alerts and insights

## Metrics & KPIs

### Application Metrics

**Request Metrics:**
```typescript
// HTTP request metrics
http_requests_total{method="GET", status="200", endpoint="/api/commands"}
http_request_duration_seconds{method="GET", endpoint="/api/commands"}
http_request_size_bytes{method="GET", endpoint="/api/commands"}
http_response_size_bytes{method="GET", endpoint="/api/commands"}
```

**Business Metrics:**
```typescript
// User activity metrics
plato_active_users_total
plato_command_executions_total{command="login", status="success"}
plato_session_duration_seconds
plato_error_rate_total{error_type="validation"}
```

**System Metrics:**
```typescript
// Resource utilization
process_cpu_usage_percentage
process_memory_usage_bytes
process_heap_usage_bytes
nodejs_gc_duration_seconds
```

### Infrastructure Metrics

**Kubernetes Metrics:**
```prometheus
# Pod metrics
kube_pod_status_phase{phase="Running"}
kube_pod_container_resource_requests{resource="memory"}
kube_pod_container_status_restarts_total

# Node metrics
kube_node_status_condition{condition="Ready"}
kube_node_status_allocatable{resource="cpu"}
kube_node_status_capacity{resource="memory"}
```

**Database Metrics:**
```sql
-- PostgreSQL metrics
pg_stat_database_tup_inserted
pg_stat_database_tup_updated
pg_stat_database_tup_deleted
pg_stat_activity_count
pg_stat_statements_mean_time
```

**Cache Metrics:**
```redis
# Redis metrics
redis_connected_clients
redis_memory_used_bytes
redis_keyspace_hits_total
redis_keyspace_misses_total
```

## Dashboards

### 1. System Overview Dashboard

**Purpose**: High-level system health and performance overview

**Key Panels:**
- Service availability (uptime percentage)
- Request rate and response times
- Error rates and types
- Resource utilization (CPU, Memory, Disk)
- Active users and sessions

**Metrics Queries:**
```prometheus
# Service availability
up{job="plato"} * 100

# Request rate (5-minute average)
rate(http_requests_total{job="plato"}[5m])

# 95th percentile response time
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket{job="plato"}[5m])) by (le)
)

# Error rate percentage
sum(rate(http_requests_total{job="plato",status=~"5.."}[5m])) /
sum(rate(http_requests_total{job="plato"}[5m])) * 100
```

### 2. Application Performance Dashboard

**Purpose**: Detailed application performance analysis

**Key Panels:**
- Request throughput by endpoint
- Response time distribution
- Memory usage and garbage collection
- Database query performance
- Cache hit/miss ratios

**Advanced Queries:**
```prometheus
# Throughput by endpoint
sum(rate(http_requests_total{job="plato"}[5m])) by (endpoint)

# Memory usage trend
process_memory_usage_bytes{job="plato"}

# Database query time
pg_stat_statements_mean_time{job="postgres"}

# Cache performance
redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total) * 100
```

### 3. User Activity Dashboard

**Purpose**: Business metrics and user behavior analysis

**Key Panels:**
- Active user count over time
- Command execution frequency
- Session duration distribution
- Feature adoption rates
- Geographic usage patterns

### 4. Security Monitoring Dashboard

**Purpose**: Security events and compliance monitoring

**Key Panels:**
- Failed authentication attempts
- Suspicious activity patterns
- Certificate expiration status
- Vulnerability scan results
- Access control violations

### Dashboard Configuration

```yaml
# Grafana dashboard JSON import
{
  "dashboard": {
    "title": "Plato TUI - System Overview",
    "panels": [
      {
        "title": "Service Availability",
        "type": "stat",
        "targets": [{
          "expr": "up{job=\"plato\"} * 100",
          "legendFormat": "Uptime %"
        }]
      },
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [{
          "expr": "rate(http_requests_total{job=\"plato\"}[5m])",
          "legendFormat": "{{method}} {{endpoint}}"
        }]
      }
    ]
  }
}
```

## Alerting

### Alert Manager Configuration

```yaml
# alertmanager.yml
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@example.com'
  slack_api_url: 'https://hooks.slack.com/services/...'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h
  receiver: 'default'
  routes:
  - match:
      severity: critical
    receiver: 'critical-alerts'
  - match:
      team: platform
    receiver: 'platform-team'

receivers:
- name: 'default'
  slack_configs:
  - channel: '#alerts'
    title: 'Plato TUI Alert'
    text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

- name: 'critical-alerts'
  slack_configs:
  - channel: '#critical-alerts'
    title: 'CRITICAL: Plato TUI'
    text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
  email_configs:
  - to: 'oncall@example.com'
    subject: 'Critical Alert: {{ .GroupLabels.alertname }}'
```

### Critical Alerts

**Service Down Alert:**
```yaml
- alert: PlatoServiceDown
  expr: up{job="plato"} == 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Plato TUI service is down"
    description: "Service has been down for more than 2 minutes"
    runbook_url: "https://wiki.example.com/runbooks/service-down"
```

**High Error Rate Alert:**
```yaml
- alert: PlatoHighErrorRate
  expr: |
    sum(rate(http_requests_total{job="plato",status=~"5.."}[5m])) /
    sum(rate(http_requests_total{job="plato"}[5m])) > 0.05
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "High error rate detected"
    description: "Error rate is {{ $value | humanizePercentage }}"
```

## Log Management

### Structured Logging Format

```typescript
// Log entry structure
interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  correlationId: string;
  userId?: string;
  sessionId?: string;
  command?: string;
  duration?: number;
  data?: any;
  error?: {
    name: string;
    message: string;
    stack: string;
  };
}

// Example log entry
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "info",
  "message": "Command executed successfully",
  "correlationId": "abc123-def456-ghi789",
  "userId": "user-12345",
  "sessionId": "session-67890",
  "command": "plato analyze",
  "duration": 1250,
  "data": {
    "filesAnalyzed": 15,
    "linesOfCode": 2500
  }
}
```

### Log Aggregation Pipeline

```yaml
# Logstash configuration
input {
  beats {
    port => 5044
  }
}

filter {
  if [kubernetes][container][name] == "plato" {
    json {
      source => "message"
    }

    date {
      match => [ "timestamp", "ISO8601" ]
    }

    if [level] in ["error", "fatal"] {
      mutate {
        add_tag => ["error"]
      }
    }

    if [correlationId] {
      mutate {
        add_field => { "trace_id" => "%{correlationId}" }
      }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "plato-logs-%{+YYYY.MM.dd}"
  }
}
```

### Log Search Queries

**Find errors by correlation ID:**
```json
{
  "query": {
    "bool": {
      "must": [
        {"term": {"correlationId": "abc123-def456-ghi789"}},
        {"range": {"@timestamp": {"gte": "now-1h"}}}
      ]
    }
  }
}
```

**Analyze error patterns:**
```json
{
  "size": 0,
  "aggs": {
    "error_types": {
      "terms": {
        "field": "error.name.keyword",
        "size": 10
      }
    },
    "error_trends": {
      "date_histogram": {
        "field": "@timestamp",
        "interval": "1h"
      }
    }
  }
}
```

## Distributed Tracing

### Trace Instrumentation

```typescript
// Trace context propagation
import { logger } from './structured-logger';
import { trace, SpanStatusCode } from '@opentelemetry/api';

async function executeCommand(command: string, context: RequestContext) {
  const tracer = trace.getTracer('plato-tui');

  return tracer.startActiveSpan('command.execute', async (span) => {
    span.setAttributes({
      'command.name': command,
      'user.id': context.userId,
      'session.id': context.sessionId
    });

    try {
      const result = await logger.withCorrelationId(() => {
        return processCommand(command, context);
      });

      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttributes({
        'command.result.success': true,
        'command.result.duration': span.endTime - span.startTime
      });

      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

### Trace Analysis

**Service Map Visualization:**
- Shows request flow between services
- Identifies bottlenecks and dependencies
- Highlights error propagation paths

**Performance Analysis:**
```sql
-- Find slowest operations
SELECT
  operation_name,
  AVG(duration_ms) as avg_duration,
  MAX(duration_ms) as max_duration,
  COUNT(*) as total_calls
FROM traces
WHERE start_time > NOW() - INTERVAL '1 hour'
GROUP BY operation_name
ORDER BY avg_duration DESC;
```

## Performance Monitoring

### SLI/SLO Definitions

**Service Level Indicators (SLIs):**
- Request Success Rate: % of successful requests
- Request Latency: Response time percentiles
- System Uptime: Service availability percentage
- Throughput: Requests handled per second

**Service Level Objectives (SLOs):**
- 99.9% of requests succeed (error rate < 0.1%)
- 95% of requests complete within 500ms
- 99.5% system uptime (4.3 hours/year downtime)
- Handle 1000+ concurrent users

**Error Budget Calculation:**
```prometheus
# Monthly error budget (99.9% SLO)
1 - (
  sum(rate(http_requests_total{job="plato",status=~"2.."}[30d])) /
  sum(rate(http_requests_total{job="plato"}[30d]))
)
```

### Performance Baselines

**Establish Baselines:**
```bash
#!/bin/bash
# performance-baseline.sh

# Collect baseline metrics
kubectl top pods -n plato-production --sort-by=cpu
kubectl top pods -n plato-production --sort-by=memory

# Database performance baseline
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d plato -c "
    SELECT
      query,
      mean_time,
      calls,
      rows
    FROM pg_stat_statements
    ORDER BY mean_time DESC
    LIMIT 10;
  "

# Redis performance baseline
kubectl exec -it redis-master-0 -n plato-production -- \
  redis-cli info stats | grep -E "(commands_processed|keyspace)"
```

### Capacity Planning

**Growth Projections:**
```prometheus
# Predict resource needs based on user growth
predict_linear(
  plato_active_users_total[7d],
  30 * 24 * 3600  # 30 days in seconds
)

# Memory usage projection
predict_linear(
  process_memory_usage_bytes{job="plato"}[7d],
  30 * 24 * 3600
)
```

**Resource Scaling Recommendations:**
1. Monitor resource utilization trends
2. Set scaling thresholds at 70% capacity
3. Plan for 2x traffic growth scenarios
4. Regular load testing validation

This monitoring guide provides comprehensive observability for Plato TUI enterprise deployments. Customize alerts, dashboards, and thresholds based on your specific SLOs and business requirements.