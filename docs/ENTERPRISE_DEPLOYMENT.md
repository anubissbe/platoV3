# Enterprise Deployment Guide

Complete guide for deploying Plato TUI in enterprise production environments with full observability, security, and scalability.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Infrastructure Setup](#infrastructure-setup)
4. [Security Configuration](#security-configuration)
5. [Deployment Process](#deployment-process)
6. [Monitoring & Observability](#monitoring--observability)
7. [Scaling & Performance](#scaling--performance)
8. [Maintenance & Operations](#maintenance--operations)

## Overview

This deployment guide covers:

- **Multi-environment deployment** (Development, Staging, Production)
- **Kubernetes orchestration** with Helm charts
- **Comprehensive monitoring** with Prometheus, Grafana, and ELK stack
- **Enterprise security** with vulnerability scanning and compliance
- **CI/CD automation** with GitHub Actions and GitLab CI
- **High availability** with load balancing and failover
- **Disaster recovery** and backup strategies

## Prerequisites

### System Requirements

**Minimum Production Cluster:**
- 3x Kubernetes nodes (4 CPU, 16GB RAM each)
- 500GB SSD storage per node
- Load balancer with SSL termination
- PostgreSQL 15+ database cluster
- Redis 7+ cache cluster

**Development/Staging:**
- 1x Kubernetes node (2 CPU, 8GB RAM)
- 100GB SSD storage
- Single PostgreSQL instance
- Single Redis instance

### Required Tools

```bash
# Kubernetes tools
kubectl >= 1.28
helm >= 3.12
k9s (recommended)

# Container tools
docker >= 20.10
docker-compose >= 2.0

# Monitoring tools
prometheus
grafana
elasticsearch
logstash
kibana

# Security tools
snyk
trivy
sonarqube (optional)
```

### Access Requirements

- Kubernetes cluster admin access
- Container registry push/pull access
- DNS management for ingress
- SSL certificate management
- External monitoring service access

## Infrastructure Setup

### 1. Kubernetes Cluster Preparation

```bash
# Create namespace
kubectl create namespace plato-production
kubectl create namespace plato-staging
kubectl create namespace plato-monitoring

# Set up RBAC
kubectl apply -f k8s/rbac/

# Install cert-manager for SSL
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true

# Install ingress controller
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install nginx-ingress ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace
```

### 2. Database Setup

**PostgreSQL High Availability:**

```yaml
# values-postgres-ha.yaml
postgresql:
  enabled: true
  architecture: replication
  auth:
    database: plato
    username: plato_user
    existingSecret: postgres-credentials
  primary:
    resources:
      limits:
        memory: 4Gi
        cpu: 2
      requests:
        memory: 2Gi
        cpu: 1
  readReplicas:
    replicaCount: 2
    resources:
      limits:
        memory: 2Gi
        cpu: 1
      requests:
        memory: 1Gi
        cpu: 500m
  metrics:
    enabled: true
    serviceMonitor:
      enabled: true
```

```bash
# Deploy PostgreSQL
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install postgres bitnami/postgresql \
  -f values-postgres-ha.yaml \
  --namespace plato-production
```

### 3. Redis Setup

```bash
# Deploy Redis cluster
helm install redis bitnami/redis \
  --set auth.enabled=true \
  --set auth.existingSecret=redis-credentials \
  --set replica.replicaCount=3 \
  --set metrics.enabled=true \
  --namespace plato-production
```

### 4. Monitoring Stack

```bash
# Install Prometheus Operator
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace plato-monitoring \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi \
  --set grafana.adminPassword=admin123

# Install ELK Stack
helm repo add elastic https://helm.elastic.co
helm install elasticsearch elastic/elasticsearch \
  --namespace plato-monitoring \
  --set replicas=3 \
  --set minimumMasterNodes=2

helm install kibana elastic/kibana \
  --namespace plato-monitoring

helm install logstash elastic/logstash \
  --namespace plato-monitoring
```

## Security Configuration

### 1. Secrets Management

```bash
# Create secrets for production
kubectl create secret generic postgres-credentials \
  --from-literal=password="$(openssl rand -base64 32)" \
  --from-literal=database-url="postgresql://plato_user:$(openssl rand -base64 32)@postgres:5432/plato" \
  --namespace plato-production

kubectl create secret generic redis-credentials \
  --from-literal=password="$(openssl rand -base64 32)" \
  --from-literal=redis-url="redis://:$(openssl rand -base64 32)@redis:6379" \
  --namespace plato-production

kubectl create secret tls plato-tls \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key \
  --namespace plato-production
```

### 2. Network Policies

```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: plato-network-policy
  namespace: plato-production
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: plato
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  - from:
    - namespaceSelector:
        matchLabels:
          name: plato-monitoring
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: plato-production
  - to: []
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
```

### 3. Pod Security Standards

```yaml
# pod-security-policy.yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: plato-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
```

## Deployment Process

### 1. Automated CI/CD Deployment

The deployment uses GitHub Actions and GitLab CI for automated deployments:

**GitHub Actions Deployment:**
```bash
# Trigger deployment
git tag v1.0.0
git push origin v1.0.0

# Monitor deployment
kubectl rollout status deployment/plato -n plato-production
```

**GitLab CI Deployment:**
```bash
# Manual staging deployment
curl -X POST \
  -F token="$CI_JOB_TOKEN" \
  -F ref="main" \
  https://gitlab.example.com/api/v4/projects/$PROJECT_ID/trigger/pipeline
```

### 2. Manual Deployment

**Production Deployment:**
```bash
# Deploy with Helm
helm upgrade --install plato ./k8s/helm/plato \
  --namespace plato-production \
  --values values-production.yaml \
  --set image.tag=v1.0.0 \
  --wait --timeout=600s

# Verify deployment
kubectl get pods -n plato-production
kubectl get services -n plato-production
kubectl get ingress -n plato-production

# Run post-deployment tests
npm run test:production
```

**Blue-Green Deployment:**
```bash
# Deploy to green environment
helm upgrade --install plato-green ./k8s/helm/plato \
  --namespace plato-production \
  --set service.selector.color=green \
  --set image.tag=v1.0.0 \
  --wait

# Verify green environment
kubectl run test-pod --image=curlimages/curl --rm -i --restart=Never \
  -- curl -f http://plato-green.plato-production.svc.cluster.local:3000/health

# Switch traffic to green
kubectl patch service plato-service -n plato-production \
  -p '{"spec":{"selector":{"color":"green"}}}'

# Verify production traffic
curl -f https://plato.example.com/health
```

### 3. Configuration Management

**Environment-specific configurations:**

```yaml
# values-production.yaml
replicaCount: 5

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20

resources:
  limits:
    cpu: 2000m
    memory: 2Gi
  requests:
    cpu: 500m
    memory: 512Mi

monitoring:
  enabled: true
  serviceMonitor:
    enabled: true

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: plato.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: plato-tls
      hosts:
        - plato.example.com

database:
  enabled: true
  host: postgres-postgresql
  existingSecret: postgres-credentials

redis:
  enabled: true
  host: redis-master
  existingSecret: redis-credentials
```

## Monitoring & Observability

### 1. Prometheus Configuration

```yaml
# prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: plato-rules
  namespace: plato-production
spec:
  groups:
  - name: plato.rules
    rules:
    - alert: PlatoServiceDown
      expr: up{job="plato"} == 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Plato TUI service is down"
        description: "Plato TUI service has been down for more than 5 minutes"

    - alert: PlatoHighResponseTime
      expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="plato"}[5m])) by (le)) > 1
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "Plato TUI high response time"
        description: "95th percentile response time is above 1 second"

    - alert: PlatoHighErrorRate
      expr: sum(rate(http_requests_total{job="plato",status=~"5.."}[5m])) / sum(rate(http_requests_total{job="plato"}[5m])) > 0.05
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Plato TUI high error rate"
        description: "Error rate is above 5%"
```

### 2. Grafana Dashboards

Import dashboards from `monitoring/grafana/dashboards/`:
- System Overview Dashboard
- Application Performance Dashboard
- User Activity Dashboard
- Security Monitoring Dashboard

```bash
# Import dashboards
curl -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_TOKEN" \
  -H "Content-Type: application/json" \
  -d @monitoring/grafana/plato-dashboard.json
```

### 3. Log Aggregation

```yaml
# fluentd-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
  namespace: plato-production
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/plato-*.log
      pos_file /var/log/fluentd-plato.log.pos
      tag plato.*
      format json
    </source>

    <filter plato.**>
      @type parser
      format json
      key_name log
    </filter>

    <match plato.**>
      @type elasticsearch
      host elasticsearch-master
      port 9200
      index_name plato-logs
      type_name _doc
      flush_interval 10s
    </match>
```

## Scaling & Performance

### 1. Horizontal Pod Autoscaler

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: plato-hpa
  namespace: plato-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: plato
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

### 2. Performance Tuning

**Node.js Optimization:**
```yaml
env:
  NODE_OPTIONS: "--max-old-space-size=2048 --enable-source-maps"
  UV_THREADPOOL_SIZE: "32"
  NODE_ENV: "production"
```

**Database Connection Pooling:**
```yaml
env:
  DATABASE_POOL_MIN: "5"
  DATABASE_POOL_MAX: "50"
  DATABASE_TIMEOUT: "30000"
```

**Redis Configuration:**
```yaml
env:
  REDIS_POOL_MIN: "5"
  REDIS_POOL_MAX: "20"
  REDIS_TIMEOUT: "5000"
```

### 3. Load Testing

```bash
# Install k6 load testing tool
brew install k6  # or appropriate package manager

# Run load tests
k6 run --vus 100 --duration 300s scripts/load-test.js

# Monitor during load test
kubectl top pods -n plato-production
kubectl get hpa -n plato-production -w
```

## Maintenance & Operations

### 1. Backup Strategy

**Database Backup:**
```bash
# Automated daily backup
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: plato-production
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15
            command:
            - /bin/bash
            - -c
            - |
              pg_dump -h postgres-postgresql -U plato_user -d plato \
                | gzip > /backup/plato-$(date +%Y%m%d).sql.gz
            env:
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: password
            volumeMounts:
            - name: backup-storage
              mountPath: /backup
          volumes:
          - name: backup-storage
            persistentVolumeClaim:
              claimName: backup-pvc
          restartPolicy: OnFailure
```

**Application State Backup:**
```bash
# Backup PVCs and configurations
kubectl get pvc -n plato-production -o yaml > backup/pvc-backup.yaml
kubectl get configmap -n plato-production -o yaml > backup/config-backup.yaml
kubectl get secret -n plato-production -o yaml > backup/secret-backup.yaml
```

### 2. Rolling Updates

```bash
# Zero-downtime rolling update
helm upgrade plato ./k8s/helm/plato \
  --namespace plato-production \
  --set image.tag=v1.1.0 \
  --wait

# Monitor rollout
kubectl rollout status deployment/plato -n plato-production

# Rollback if needed
helm rollback plato 1 -n plato-production
```

### 3. Health Checks

```bash
# Application health
curl -f https://plato.example.com/health

# Kubernetes health
kubectl get pods -n plato-production
kubectl get nodes
kubectl cluster-info

# Database health
kubectl exec -it postgres-postgresql-0 -n plato-production \
  -- psql -U plato_user -d plato -c "SELECT version();"

# Redis health
kubectl exec -it redis-master-0 -n plato-production \
  -- redis-cli ping
```

### 4. Troubleshooting

**Common Issues:**

```bash
# Pod not starting
kubectl describe pod <pod-name> -n plato-production
kubectl logs <pod-name> -n plato-production

# Service not accessible
kubectl get svc -n plato-production
kubectl get ingress -n plato-production
kubectl describe ingress plato -n plato-production

# Performance issues
kubectl top pods -n plato-production
kubectl top nodes

# Database connection issues
kubectl logs <plato-pod> -n plato-production | grep -i database
kubectl exec -it postgres-postgresql-0 -n plato-production -- \
  psql -U plato_user -d plato -c "SELECT count(*) FROM pg_stat_activity;"
```

### 5. Security Operations

**Vulnerability Scanning:**
```bash
# Scan running containers
trivy k8s --report summary cluster

# Security policy compliance
kubectl get psp
kubectl get networkpolicy -n plato-production

# Certificate expiration check
kubectl get certificates -n plato-production
```

**Audit Logging:**
```bash
# Check audit logs
kubectl logs kube-apiserver-<node> -n kube-system | grep audit

# Review RBAC permissions
kubectl auth can-i --list --as=system:serviceaccount:plato-production:plato
```

## Emergency Procedures

### 1. Incident Response

**Critical Service Down:**
1. Check service status: `kubectl get pods -n plato-production`
2. Review recent deployments: `helm history plato -n plato-production`
3. Check resource usage: `kubectl top pods -n plato-production`
4. Review logs: `kubectl logs -l app.kubernetes.io/name=plato -n plato-production`
5. Scale up if needed: `kubectl scale deployment plato --replicas=10 -n plato-production`
6. Rollback if necessary: `helm rollback plato -n plato-production`

**Database Issues:**
1. Check database status: `kubectl get pods -l app=postgresql -n plato-production`
2. Review connection pool: Check application logs for connection errors
3. Verify database connectivity: `kubectl exec -it <plato-pod> -- nc -zv postgres-postgresql 5432`
4. Check disk space: `kubectl exec -it postgres-postgresql-0 -- df -h`

### 2. Disaster Recovery

**Complete Cluster Failure:**
1. Provision new cluster
2. Restore database from backup
3. Deploy application with Helm
4. Update DNS to point to new cluster
5. Verify functionality

**Data Center Outage:**
1. Activate backup data center
2. Restore from offsite backups
3. Update load balancer configuration
4. Communicate with stakeholders

This deployment guide provides a comprehensive foundation for enterprise-grade Plato TUI deployment. Adapt configurations based on specific organizational requirements and security policies.