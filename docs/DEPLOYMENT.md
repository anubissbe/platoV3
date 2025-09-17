# Deployment Guide

Production-ready deployment guide for Plato TUI - an advanced AI-powered terminal coding assistant.

## 🚀 Quick Deployment

### System Requirements

**Minimum Requirements:**
- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Git 2.30.0 or higher
- 512MB RAM available
- 100MB disk space

**Recommended Requirements:**
- Node.js 20.0.0 or higher
- npm 10.0.0 or higher
- 2GB RAM available
- 1GB disk space
- SSD storage for optimal performance

### Supported Platforms

- ✅ Linux (Ubuntu 20.04+, RHEL 8+, Debian 11+)
- ✅ macOS 11.0+ (Big Sur and later)
- ✅ Windows 10+ with WSL2
- ✅ Docker containers
- ✅ Cloud platforms (AWS, GCP, Azure)

## 📦 Installation Methods

### Method 1: Production Build

```bash
# Clone repository
git clone https://your-repo/plato.git
cd plato

# Install dependencies
npm ci --only=production

# Build application
npm run build

# Create systemd service (Linux)
sudo cp deploy/plato.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable plato
sudo systemctl start plato
```

### Method 2: Docker Deployment

```bash
# Pull the official image
docker pull plato:latest

# Run with persistent data
docker run -d \
  --name plato-prod \
  -p 3000:3000 \
  -v /host/data:/app/.plato \
  -v /host/config:/app/.config \
  plato:latest

# Using Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

### Method 3: Cloud Deployment

#### AWS ECS
```bash
# Deploy using AWS CLI
aws ecs create-service \
  --cluster plato-cluster \
  --service-name plato-service \
  --task-definition plato:1 \
  --desired-count 2
```

#### Kubernetes
```bash
# Apply configuration
kubectl apply -f k8s/plato-deployment.yml
kubectl apply -f k8s/plato-service.yml
```

## 🔧 Configuration Management

### Environment Configuration

Create production environment file:

```bash
# /opt/plato/.env
NODE_ENV=production
PLATO_LOG_LEVEL=info
PLATO_CONFIG_DIR=/opt/plato/config
PLATO_DATA_DIR=/opt/plato/data
PLATO_MEMORY_DIR=/opt/plato/data/memory

# Security settings
PLATO_ENABLE_TELEMETRY=false
PLATO_SECURITY_MODE=strict
PLATO_MAX_MEMORY_SIZE=500mb
PLATO_SESSION_TIMEOUT=3600

# Performance settings
PLATO_CACHE_SIZE=100mb
PLATO_WORKER_THREADS=4
PLATO_MAX_CONCURRENT_SESSIONS=50
```

### Application Configuration

```json
{
  "version": "1.0.0",
  "deployment": {
    "environment": "production",
    "region": "us-east-1",
    "loadBalancer": true,
    "autoScale": {
      "enabled": true,
      "minInstances": 2,
      "maxInstances": 10,
      "targetCPU": 70
    }
  },
  "security": {
    "corsOrigins": ["https://yourdomain.com"],
    "rateLimiting": {
      "enabled": true,
      "windowMs": 900000,
      "max": 100
    },
    "encryption": {
      "algorithm": "aes-256-gcm",
      "keyRotation": "weekly"
    }
  },
  "monitoring": {
    "healthCheck": {
      "enabled": true,
      "interval": 30,
      "timeout": 5
    },
    "metrics": {
      "enabled": true,
      "endpoint": "/metrics",
      "format": "prometheus"
    },
    "logging": {
      "level": "info",
      "format": "json",
      "rotation": "daily"
    }
  }
}
```

## 🔒 Security Configuration

### SSL/TLS Setup

```bash
# Generate SSL certificates
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/plato.key \
  -out /etc/ssl/certs/plato.crt

# Configure nginx proxy
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/ssl/certs/plato.crt;
    ssl_certificate_key /etc/ssl/private/plato.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Authentication Configuration

```bash
# Configure OAuth providers
export COPILOT_CLIENT_ID="your-client-id"
export COPILOT_CLIENT_SECRET="your-client-secret"
export GITLAB_APPLICATION_ID="your-gitlab-id"
export GITLAB_SECRET="your-gitlab-secret"

# Set up JWT signing
export JWT_SECRET="your-256-bit-secret"
export JWT_EXPIRY="24h"
```

### Firewall Rules

```bash
# UFW configuration (Ubuntu)
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 443/tcp  # HTTPS
sudo ufw allow 80/tcp   # HTTP (redirect)
sudo ufw --force enable

# iptables rules
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
```

## 📊 Monitoring and Observability

### Health Checks

```bash
# Application health endpoint
curl -f http://localhost:3000/health

# Detailed system status
curl -f http://localhost:3000/health/detailed
```

### Metrics Collection

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'plato'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: /metrics
```

### Log Management

```yaml
# docker-compose.logging.yml
version: '3.8'
services:
  plato:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    volumes:
      - ./logs:/app/logs
```

### Performance Monitoring

```bash
# Install monitoring tools
npm install -g clinic
clinic doctor -- node dist/cli.js
clinic flame -- node dist/cli.js
clinic bubbleprof -- node dist/cli.js
```

## 🔄 Maintenance Procedures

### Backup Strategy

```bash
#!/bin/bash
# backup.sh - Daily backup script

BACKUP_DIR="/opt/backups/plato"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR/$DATE"

# Backup configuration
tar -czf "$BACKUP_DIR/$DATE/config.tar.gz" /opt/plato/config

# Backup user data
tar -czf "$BACKUP_DIR/$DATE/data.tar.gz" /opt/plato/data

# Backup database (if applicable)
pg_dump plato_db > "$BACKUP_DIR/$DATE/database.sql"

# Clean old backups (keep 30 days)
find "$BACKUP_DIR" -type d -mtime +30 -exec rm -rf {} \;
```

### Update Procedures

```bash
#!/bin/bash
# update.sh - Zero-downtime update

# 1. Download new version
git fetch origin
git checkout v1.1.0

# 2. Install dependencies
npm ci --only=production

# 3. Build new version
npm run build

# 4. Run database migrations
npm run migrate

# 5. Restart services with rolling update
docker-compose up -d --no-deps --force-recreate plato
```

### Database Maintenance

```bash
# PostgreSQL maintenance (if using database)
# Run weekly
VACUUM ANALYZE;
REINDEX DATABASE plato_db;

# Check database size
SELECT pg_size_pretty(pg_database_size('plato_db'));
```

## ⚡ Performance Optimization

### Application Tuning

```javascript
// production.config.js
module.exports = {
  server: {
    keepAliveTimeout: 65000,
    headersTimeout: 66000,
    maxConnections: 1000
  },
  memory: {
    maxOldSpaceSize: 2048,
    maxSemiSpaceSize: 256
  },
  cluster: {
    workers: require('os').cpus().length
  }
};
```

### Load Balancing

```nginx
# nginx load balancer
upstream plato_backend {
    least_conn;
    server 127.0.0.1:3000 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3001 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 weight=1 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    location / {
        proxy_pass http://plato_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Caching Strategy

```bash
# Redis configuration for session storage
redis-cli CONFIG SET maxmemory 256mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Application cache configuration
export CACHE_TTL=3600
export CACHE_MAX_SIZE=1000
export REDIS_URL="redis://localhost:6379"
```

## 🚨 Troubleshooting

### Common Issues

**Issue: High Memory Usage**
```bash
# Check memory usage
ps aux | grep plato
top -p $(pgrep plato)

# Solution: Increase memory limits
export NODE_OPTIONS="--max-old-space-size=4096"
```

**Issue: SSL Certificate Errors**
```bash
# Check certificate validity
openssl x509 -in /etc/ssl/certs/plato.crt -text -noout

# Renew certificate (Let's Encrypt)
certbot renew --nginx
```

**Issue: Database Connection Failures**
```bash
# Check database connectivity
pg_isready -h localhost -p 5432

# Restart database service
sudo systemctl restart postgresql
```

### Log Analysis

```bash
# Application logs
tail -f /opt/plato/logs/application.log

# Error logs
grep ERROR /opt/plato/logs/application.log | tail -20

# Performance logs
grep SLOW /opt/plato/logs/performance.log
```

### Emergency Procedures

```bash
# Emergency shutdown
sudo systemctl stop plato
docker-compose down

# Quick rollback
git checkout previous-version
npm run build
sudo systemctl start plato

# Database recovery
pg_restore -d plato_db /opt/backups/latest/database.sql
```

## 📋 Production Checklist

Before deploying to production:

- [ ] All tests passing (`npm run test:comprehensive`)
- [ ] Security scan completed (`npm audit`)
- [ ] Performance benchmarks met (`npm run perf:benchmark`)
- [ ] SSL certificates configured
- [ ] Monitoring endpoints active
- [ ] Backup procedures tested
- [ ] Log rotation configured
- [ ] Firewall rules applied
- [ ] Load balancer configured (if applicable)
- [ ] DNS records updated
- [ ] Health checks responding
- [ ] Rollback procedure documented

## 🔗 Additional Resources

- [Security Hardening Guide](./SECURITY.md)
- [Performance Optimization](./PERFORMANCE.md)
- [Monitoring Setup](./MONITORING.md)
- [Backup and Recovery](./BACKUP.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)

---

**Last Updated:** 2025-09-16
**Version:** 1.0.0
**Status:** Production Ready