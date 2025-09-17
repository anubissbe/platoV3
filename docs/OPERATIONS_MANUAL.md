# Operations Manual

Comprehensive operational procedures for managing Plato TUI in enterprise environments.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [System Monitoring](#system-monitoring)
3. [Performance Management](#performance-management)
4. [Security Operations](#security-operations)
5. [Incident Management](#incident-management)
6. [Maintenance Procedures](#maintenance-procedures)
7. [Backup & Recovery](#backup--recovery)
8. [Troubleshooting Guide](#troubleshooting-guide)

## Daily Operations

### Morning Checklist

**System Health Verification:**
```bash
#!/bin/bash
# daily-health-check.sh

echo "=== Plato TUI Daily Health Check $(date) ==="

# 1. Check all services are running
kubectl get pods -n plato-production -o wide
kubectl get services -n plato-production
kubectl get ingress -n plato-production

# 2. Verify external accessibility
curl -s -o /dev/null -w "Response time: %{time_total}s\nHTTP status: %{http_code}\n" \
  https://plato.example.com/health

# 3. Check resource utilization
kubectl top pods -n plato-production
kubectl top nodes

# 4. Review overnight logs
kubectl logs -l app.kubernetes.io/name=plato -n plato-production \
  --since=24h --tail=100 | grep -i "error\|fatal\|exception"

# 5. Database health
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d plato -c "
    SELECT 'Database Size', pg_size_pretty(pg_database_size('plato'));
    SELECT 'Active Connections', count(*) FROM pg_stat_activity;
    SELECT 'Longest Running Query', max(now() - query_start) FROM pg_stat_activity WHERE state = 'active';
  "

# 6. Redis health
kubectl exec -it redis-master-0 -n plato-production -- \
  redis-cli info memory | grep used_memory_human

# 7. Certificate expiration
kubectl get certificates -n plato-production -o custom-columns=NAME:.metadata.name,READY:.status.conditions[0].status,SECRET:.spec.secretName,EXPIRY:.status.notAfter

echo "=== Health Check Complete ==="
```

**Metrics Review:**
```bash
# Check key metrics from last 24 hours
curl -s "http://prometheus:9090/api/v1/query_range" \
  -d "query=rate(http_requests_total{job=\"plato\"}[5m])" \
  -d "start=$(date -d '24 hours ago' +%s)" \
  -d "end=$(date +%s)" \
  -d "step=3600" | jq '.data.result[0].values'

# Check error rates
curl -s "http://prometheus:9090/api/v1/query" \
  -d "query=rate(http_requests_total{job=\"plato\",status=~\"5..\"}[24h])" | \
  jq '.data.result[0].value[1]'

# Memory usage trend
kubectl top pods -n plato-production --sort-by=memory
```

### Weekly Tasks

**Performance Review:**
```bash
#!/bin/bash
# weekly-performance-review.sh

echo "=== Weekly Performance Review $(date) ==="

# 1. Generate performance report
npm run perf:weekly-report

# 2. Review scaling metrics
kubectl describe hpa plato-hpa -n plato-production

# 3. Analyze slow queries
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d plato -c "
    SELECT query, mean_time, calls, total_time
    FROM pg_stat_statements
    ORDER BY mean_time DESC
    LIMIT 10;
  "

# 4. Check disk usage growth
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d plato -c "
    SELECT schemaname, tablename,
           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
    FROM pg_tables
    WHERE schemaname NOT IN ('information_schema','pg_catalog')
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LIMIT 10;
  "

# 5. Security scan
npm run security:scan
trivy k8s --report summary cluster

echo "=== Performance Review Complete ==="
```

### Monthly Tasks

**Capacity Planning:**
```bash
#!/bin/bash
# monthly-capacity-review.sh

echo "=== Monthly Capacity Review $(date) ==="

# 1. Resource usage trends
kubectl top pods -n plato-production --sort-by=cpu
kubectl top pods -n plato-production --sort-by=memory

# 2. Storage growth analysis
kubectl get pv -o custom-columns=NAME:.metadata.name,CAPACITY:.spec.capacity.storage,USED:.status.phase

# 3. Network usage patterns
# Export from Prometheus/Grafana

# 4. User growth metrics
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d plato -c "
    SELECT
      date_trunc('month', created_at) as month,
      count(*) as new_users,
      sum(count(*)) over (order by date_trunc('month', created_at)) as total_users
    FROM users
    WHERE created_at >= now() - interval '12 months'
    GROUP BY date_trunc('month', created_at)
    ORDER BY month;
  "

echo "=== Capacity Review Complete ==="
```

## System Monitoring

### Key Metrics to Monitor

**Application Metrics:**
- Request rate (requests per second)
- Response time (95th percentile < 500ms)
- Error rate (< 0.1%)
- Active sessions
- Command execution time
- Memory usage per pod
- CPU utilization per pod

**Infrastructure Metrics:**
- Node CPU usage (< 70%)
- Node memory usage (< 80%)
- Disk usage (< 85%)
- Network I/O
- Pod restart count
- Container image pull time

**Database Metrics:**
- Connection pool usage
- Query execution time
- Database size growth
- Lock wait time
- Cache hit ratio (> 95%)

**Redis Metrics:**
- Memory usage
- Hit ratio (> 90%)
- Connected clients
- Commands per second

### Alerting Rules

**Critical Alerts (Immediate Response):**
```yaml
groups:
- name: critical
  rules:
  - alert: ServiceDown
    expr: up{job="plato"} == 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Plato service is down"

  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    for: 5m
    labels:
      severity: critical

  - alert: DatabaseDown
    expr: up{job="postgres"} == 0
    for: 2m
    labels:
      severity: critical

  - alert: OutOfMemory
    expr: container_memory_usage_bytes/container_spec_memory_limit_bytes > 0.9
    for: 5m
    labels:
      severity: critical
```

**Warning Alerts (Monitor Closely):**
```yaml
- alert: HighResponseTime
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
  for: 10m
  labels:
    severity: warning

- alert: HighCPUUsage
  expr: container_cpu_usage_rate > 0.8
  for: 15m
  labels:
    severity: warning

- alert: DiskSpaceHigh
  expr: (node_filesystem_size_bytes - node_filesystem_free_bytes) / node_filesystem_size_bytes > 0.85
  for: 10m
  labels:
    severity: warning
```

### Dashboard Monitoring

**Primary Dashboard Panels:**
1. Service Status (Up/Down indicators)
2. Request Rate Timeline
3. Response Time Distribution
4. Error Rate Percentage
5. Active Users Count
6. Resource Utilization (CPU/Memory)
7. Database Performance
8. Cache Hit Ratio

**Secondary Dashboard Panels:**
1. Pod Scaling History
2. Network I/O
3. Storage Usage
4. Security Events
5. Deployment Timeline
6. Alert History

## Performance Management

### Performance Optimization

**Application Level:**
```javascript
// Performance monitoring middleware
const performanceMonitor = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        url: req.url,
        method: req.method,
        duration,
        userAgent: req.get('User-Agent')
      });
    }

    // Emit metrics
    metrics.histogram('http_request_duration_seconds', duration / 1000, {
      method: req.method,
      route: req.route?.path || req.url,
      status_code: res.statusCode
    });
  });

  next();
};
```

**Database Optimization:**
```sql
-- Identify slow queries
SELECT
  query,
  mean_time,
  calls,
  total_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 20;

-- Index usage analysis
SELECT
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY n_distinct DESC;

-- Connection pool monitoring
SELECT
  state,
  count(*)
FROM pg_stat_activity
GROUP BY state;
```

**Cache Optimization:**
```bash
# Redis performance analysis
kubectl exec -it redis-master-0 -n plato-production -- redis-cli info stats

# Key expiration patterns
kubectl exec -it redis-master-0 -n plato-production -- redis-cli info keyspace

# Memory usage optimization
kubectl exec -it redis-master-0 -n plato-production -- redis-cli memory usage <key>
```

### Capacity Planning

**Scaling Triggers:**
- CPU utilization > 70% for 5 minutes
- Memory utilization > 80% for 5 minutes
- Response time > 500ms for 95th percentile
- Queue depth > 100 requests

**Resource Calculations:**
```bash
# Calculate required resources based on load
function calculate_resources() {
  local current_rps=$1
  local target_rps=$2
  local current_pods=$3

  local scale_factor=$(echo "scale=2; $target_rps / $current_rps" | bc)
  local required_pods=$(echo "scale=0; $current_pods * $scale_factor / 1" | bc)

  echo "Scale factor: $scale_factor"
  echo "Required pods: $required_pods"
  echo "Recommended CPU: $((required_pods * 500))m"
  echo "Recommended Memory: $((required_pods * 512))Mi"
}

# Usage
calculate_resources 1000 2000 5
```

## Security Operations

### Daily Security Tasks

**Vulnerability Monitoring:**
```bash
#!/bin/bash
# daily-security-check.sh

echo "=== Daily Security Check $(date) ==="

# 1. Scan running containers
trivy k8s --report summary cluster

# 2. Check for unauthorized access attempts
kubectl logs -l app=nginx-ingress --since=24h | grep -E "(401|403|429)"

# 3. Certificate expiration check
kubectl get certificates -n plato-production -o json | \
  jq -r '.items[] | select(.status.notAfter != null) |
         "\(.metadata.name): \(.status.notAfter)"' | \
  while read cert; do
    expiry=$(echo $cert | cut -d: -f2)
    days_left=$(( ($(date -d "$expiry" +%s) - $(date +%s)) / 86400 ))
    if [ $days_left -lt 30 ]; then
      echo "WARNING: Certificate $cert expires in $days_left days"
    fi
  done

# 4. Pod security policy compliance
kubectl get pods -n plato-production -o json | \
  jq -r '.items[] | select(.spec.securityContext.runAsRoot == true) | .metadata.name'

# 5. Network policy verification
kubectl get networkpolicies -n plato-production

echo "=== Security Check Complete ==="
```

**Access Audit:**
```bash
# Review RBAC permissions
kubectl get rolebindings -n plato-production -o yaml
kubectl get clusterrolebindings -o yaml

# Check service account usage
kubectl get pods -n plato-production -o json | \
  jq -r '.items[] | "\(.metadata.name): \(.spec.serviceAccount // "default")"'

# Audit API access
kubectl logs kube-apiserver-* -n kube-system --since=24h | \
  grep -E "(user|group)" | head -20
```

### Security Incident Response

**Level 1 - Low Risk:**
- Automated vulnerability scan findings
- License compliance issues
- Non-critical access violations

**Level 2 - Medium Risk:**
- High severity vulnerabilities
- Suspicious network activity
- Authentication anomalies

**Level 3 - High Risk:**
- Critical vulnerabilities with exploits
- Unauthorized access detected
- Data exfiltration attempts

**Incident Response Playbook:**

1. **Immediate Response (0-15 minutes):**
   ```bash
   # Isolate affected pods
   kubectl scale deployment <affected-deployment> --replicas=0 -n plato-production

   # Block suspicious IPs
   kubectl patch ingress plato -n plato-production -p '
     metadata:
       annotations:
         nginx.ingress.kubernetes.io/whitelist-source-range: "10.0.0.0/8,192.168.0.0/16"'

   # Enable audit logging
   kubectl patch configmap audit-policy -n kube-system -p '
     data:
       audit.yaml: |
         apiVersion: audit.k8s.io/v1
         kind: Policy
         rules:
         - level: RequestResponse'
   ```

2. **Investigation (15-60 minutes):**
   ```bash
   # Gather evidence
   kubectl logs -l app.kubernetes.io/name=plato -n plato-production --since=1h > /tmp/incident-logs.txt
   kubectl get events -n plato-production --sort-by='.lastTimestamp' > /tmp/incident-events.txt

   # Network analysis
   kubectl exec -it <network-tools-pod> -- tcpdump -i any -w /tmp/network-capture.pcap

   # File system analysis
   kubectl exec -it <affected-pod> -- find /var/log -name "*.log" -mtime -1 -exec cat {} \;
   ```

3. **Containment (1-4 hours):**
   ```bash
   # Patch vulnerabilities
   helm upgrade plato ./k8s/helm/plato --set image.tag=patched-version -n plato-production

   # Update security policies
   kubectl apply -f security/updated-network-policies.yaml

   # Rotate secrets
   kubectl delete secret plato-secrets -n plato-production
   kubectl create secret generic plato-secrets --from-env-file=.env.secure -n plato-production
   ```

## Incident Management

### Incident Classification

**Priority 1 - Critical:**
- Complete service outage
- Data breach or security incident
- Data corruption or loss
- SLA violation affecting multiple customers

**Priority 2 - High:**
- Significant performance degradation
- Partial service outage
- Single customer impact
- Security vulnerability (high/critical)

**Priority 3 - Medium:**
- Minor performance issues
- Non-critical feature unavailable
- Infrastructure maintenance required

**Priority 4 - Low:**
- Cosmetic issues
- Documentation updates
- Enhancement requests

### Incident Response Process

**1. Detection and Alerting:**
```bash
# Automated detection via monitoring
# Alert routing to on-call engineer
# Incident creation in ticketing system

# Manual escalation path:
# L1 Support -> L2 Support -> Engineering -> Management
```

**2. Initial Response (Within 15 minutes):**
```bash
#!/bin/bash
# incident-response.sh

INCIDENT_ID=$1
SEVERITY=$2

echo "=== Incident Response Started ==="
echo "Incident ID: $INCIDENT_ID"
echo "Severity: $SEVERITY"
echo "Responder: $(whoami)"
echo "Timestamp: $(date)"

# Create incident workspace
mkdir -p /tmp/incident-$INCIDENT_ID
cd /tmp/incident-$INCIDENT_ID

# Gather initial data
kubectl get pods -n plato-production -o wide > pods-status.txt
kubectl get events -n plato-production --sort-by='.lastTimestamp' > events.txt
kubectl logs -l app.kubernetes.io/name=plato -n plato-production --since=30m > app-logs.txt

# Check external dependencies
curl -s -w "Response: %{http_code}, Time: %{time_total}s\n" \
  https://plato.example.com/health > health-check.txt

# Notify stakeholders
echo "Incident $INCIDENT_ID detected. Initial response in progress." | \
  slack-cli send --channel "#incidents"

echo "=== Initial data collection complete ==="
```

**3. Investigation and Diagnosis:**
```bash
# Root cause analysis tools
kubectl describe pod <failing-pod> -n plato-production
kubectl logs <failing-pod> -n plato-production --previous

# Performance analysis
kubectl top pods -n plato-production
kubectl top nodes

# Network connectivity
kubectl exec -it <test-pod> -- nslookup postgres-postgresql.plato-production.svc.cluster.local
kubectl exec -it <test-pod> -- telnet postgres-postgresql 5432

# Database analysis
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d plato -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

**4. Resolution and Recovery:**
```bash
# Common resolution actions
kubectl rollout restart deployment/plato -n plato-production
kubectl scale deployment plato --replicas=10 -n plato-production
helm rollback plato -n plato-production

# Database recovery
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d plato -c "REINDEX DATABASE plato;"

# Cache clearing
kubectl exec -it redis-master-0 -n plato-production -- redis-cli FLUSHDB
```

**5. Post-Incident Review:**
```bash
# Generate incident report
cat > incident-report-$INCIDENT_ID.md << EOF
# Incident Report: $INCIDENT_ID

## Summary
- **Date:** $(date)
- **Duration:** X hours
- **Impact:** Brief description
- **Root Cause:** Technical details

## Timeline
- HH:MM - Incident detected
- HH:MM - Response initiated
- HH:MM - Root cause identified
- HH:MM - Fix implemented
- HH:MM - Service restored

## Root Cause Analysis
Detailed technical analysis...

## Action Items
1. Immediate actions
2. Short-term improvements
3. Long-term prevention measures

## Lessons Learned
- What went well
- What could be improved
- Process changes needed
EOF
```

## Maintenance Procedures

### Scheduled Maintenance

**Monthly Patching Window:**
```bash
#!/bin/bash
# monthly-maintenance.sh

echo "=== Monthly Maintenance Started $(date) ==="

# 1. Update monitoring notification
curl -X POST "$SLACK_WEBHOOK" -d '{
  "text": "🔧 Scheduled maintenance started. Expected duration: 2 hours."
}'

# 2. Scale down to minimum replicas
kubectl scale deployment plato --replicas=2 -n plato-production

# 3. Update system packages (if using managed nodes)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
# Perform node updates
kubectl uncordon <node-name>

# 4. Update Kubernetes components
helm repo update
helm upgrade prometheus prometheus-community/kube-prometheus-stack -n plato-monitoring
helm upgrade ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx

# 5. Update application
helm upgrade plato ./k8s/helm/plato \
  --namespace plato-production \
  --set image.tag=latest \
  --wait --timeout=600s

# 6. Run post-maintenance tests
npm run test:integration
npm run test:e2e

# 7. Restore normal scaling
kubectl scale deployment plato --replicas=5 -n plato-production

# 8. Complete maintenance notification
curl -X POST "$SLACK_WEBHOOK" -d '{
  "text": "✅ Scheduled maintenance completed successfully."
}'

echo "=== Maintenance Complete $(date) ==="
```

**Emergency Maintenance:**
```bash
#!/bin/bash
# emergency-maintenance.sh

ISSUE_DESCRIPTION=$1
ESTIMATED_DURATION=$2

echo "=== Emergency Maintenance Started ==="
echo "Issue: $ISSUE_DESCRIPTION"
echo "Estimated Duration: $ESTIMATED_DURATION"

# 1. Immediate notification
curl -X POST "$SLACK_WEBHOOK" -d "{
  \"text\": \"🚨 Emergency maintenance in progress\\nIssue: $ISSUE_DESCRIPTION\\nEstimated Duration: $ESTIMATED_DURATION\"
}"

# 2. Enable maintenance mode
kubectl patch ingress plato -n plato-production -p '{
  "metadata": {
    "annotations": {
      "nginx.ingress.kubernetes.io/maintenance-mode": "true"
    }
  }
}'

# 3. Perform emergency fix
# (Implementation specific to the issue)

# 4. Disable maintenance mode
kubectl patch ingress plato -n plato-production -p '{
  "metadata": {
    "annotations": {
      "nginx.ingress.kubernetes.io/maintenance-mode": null
    }
  }
}'

# 5. Completion notification
curl -X POST "$SLACK_WEBHOOK" -d '{
  "text": "✅ Emergency maintenance completed. Service restored."
}'

echo "=== Emergency Maintenance Complete ==="
```

### Database Maintenance

**Weekly Database Maintenance:**
```sql
-- Run during low-traffic period
BEGIN;

-- Update statistics
ANALYZE;

-- Reindex if necessary
REINDEX INDEX CONCURRENTLY IF EXISTS slow_query_index;

-- Vacuum full on large tables (schedule during maintenance window)
VACUUM (ANALYZE, VERBOSE) user_sessions;
VACUUM (ANALYZE, VERBOSE) command_history;

-- Check for bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

COMMIT;
```

**Database Backup Verification:**
```bash
#!/bin/bash
# verify-backup.sh

BACKUP_FILE=$1

echo "=== Backup Verification Started ==="

# 1. Test restore to temporary database
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  createdb -U plato_user test_restore_$(date +%Y%m%d)

# 2. Restore backup
gunzip -c $BACKUP_FILE | kubectl exec -i postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d test_restore_$(date +%Y%m%d)

# 3. Verify data integrity
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d test_restore_$(date +%Y%m%d) -c "
    SELECT 'Users', count(*) FROM users;
    SELECT 'Sessions', count(*) FROM user_sessions;
    SELECT 'Commands', count(*) FROM command_history;
  "

# 4. Cleanup test database
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  dropdb -U plato_user test_restore_$(date +%Y%m%d)

echo "=== Backup Verification Complete ==="
```

This operations manual provides detailed procedures for managing Plato TUI in production environments. Customize the scripts and procedures according to your specific infrastructure and organizational requirements.