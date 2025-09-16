#!/bin/bash

# Enterprise Setup Script for Plato TUI
# Comprehensive deployment automation with monitoring and security

set -euo pipefail

# Configuration
NAMESPACE_PROD="plato-production"
NAMESPACE_STAGING="plato-staging"
NAMESPACE_MONITORING="plato-monitoring"
DOMAIN="${DOMAIN:-plato.example.com}"
STAGING_DOMAIN="${STAGING_DOMAIN:-plato-staging.example.com}"
POSTGRES_VERSION="${POSTGRES_VERSION:-15}"
REDIS_VERSION="${REDIS_VERSION:-7}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check required tools
    local tools=("kubectl" "helm" "docker" "openssl" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "$tool is required but not installed"
            exit 1
        fi
    done

    # Check Kubernetes connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    # Check Helm repositories
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo add elastic https://helm.elastic.co
    helm repo add jetstack https://charts.jetstack.io
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update

    log_success "Prerequisites check completed"
}

# Create namespaces
create_namespaces() {
    log_info "Creating namespaces..."

    local namespaces=("$NAMESPACE_PROD" "$NAMESPACE_STAGING" "$NAMESPACE_MONITORING" "cert-manager" "ingress-nginx")

    for ns in "${namespaces[@]}"; do
        if kubectl get namespace "$ns" &> /dev/null; then
            log_warn "Namespace $ns already exists"
        else
            kubectl create namespace "$ns"
            log_success "Created namespace $ns"
        fi
    done

    # Add labels to namespaces
    kubectl label namespace "$NAMESPACE_PROD" name="$NAMESPACE_PROD" --overwrite
    kubectl label namespace "$NAMESPACE_STAGING" name="$NAMESPACE_STAGING" --overwrite
    kubectl label namespace "$NAMESPACE_MONITORING" name="$NAMESPACE_MONITORING" --overwrite
}

# Generate secrets
generate_secrets() {
    log_info "Generating secrets..."

    # PostgreSQL secrets
    local postgres_password
    postgres_password=$(openssl rand -base64 32)

    kubectl create secret generic postgres-credentials \
        --from-literal=password="$postgres_password" \
        --from-literal=database-url="postgresql://plato_user:$postgres_password@postgres-postgresql:5432/plato" \
        --namespace="$NAMESPACE_PROD" \
        --dry-run=client -o yaml | kubectl apply -f -

    kubectl create secret generic postgres-credentials \
        --from-literal=password="$postgres_password" \
        --from-literal=database-url="postgresql://plato_user:$postgres_password@postgres-postgresql:5432/plato" \
        --namespace="$NAMESPACE_STAGING" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Redis secrets
    local redis_password
    redis_password=$(openssl rand -base64 32)

    kubectl create secret generic redis-credentials \
        --from-literal=password="$redis_password" \
        --from-literal=redis-url="redis://:$redis_password@redis-master:6379" \
        --namespace="$NAMESPACE_PROD" \
        --dry-run=client -o yaml | kubectl apply -f -

    kubectl create secret generic redis-credentials \
        --from-literal=password="$redis_password" \
        --from-literal=redis-url="redis://:$redis_password@redis-master:6379" \
        --namespace="$NAMESPACE_STAGING" \
        --dry-run=client -o yaml | kubectl apply -f -

    # Application secrets
    kubectl create secret generic plato-secrets \
        --from-literal=jwt-secret="$(openssl rand -base64 64)" \
        --from-literal=encryption-key="$(openssl rand -base64 32)" \
        --namespace="$NAMESPACE_PROD" \
        --dry-run=client -o yaml | kubectl apply -f -

    kubectl create secret generic plato-secrets \
        --from-literal=jwt-secret="$(openssl rand -base64 64)" \
        --from-literal=encryption-key="$(openssl rand -base64 32)" \
        --namespace="$NAMESPACE_STAGING" \
        --dry-run=client -o yaml | kubectl apply -f -

    log_success "Secrets generated and applied"
}

# Install cert-manager
install_cert_manager() {
    log_info "Installing cert-manager..."

    helm upgrade --install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --set installCRDs=true \
        --wait --timeout=600s

    # Wait for cert-manager to be ready
    kubectl wait --for=condition=available --timeout=300s deployment/cert-manager -n cert-manager
    kubectl wait --for=condition=available --timeout=300s deployment/cert-manager-webhook -n cert-manager
    kubectl wait --for=condition=available --timeout=300s deployment/cert-manager-cainjector -n cert-manager

    # Create ClusterIssuer for Let's Encrypt
    cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@${DOMAIN}
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

    log_success "cert-manager installed and configured"
}

# Install ingress controller
install_ingress() {
    log_info "Installing NGINX Ingress Controller..."

    helm upgrade --install nginx-ingress ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --set controller.metrics.enabled=true \
        --set controller.metrics.serviceMonitor.enabled=true \
        --set controller.podAnnotations."prometheus\.io/scrape"="true" \
        --set controller.podAnnotations."prometheus\.io/port"="10254" \
        --wait --timeout=600s

    log_success "NGINX Ingress Controller installed"
}

# Install PostgreSQL
install_postgresql() {
    log_info "Installing PostgreSQL..."

    # Production PostgreSQL with HA
    helm upgrade --install postgres bitnami/postgresql \
        --namespace="$NAMESPACE_PROD" \
        --set auth.database=plato \
        --set auth.username=plato_user \
        --set auth.existingSecret=postgres-credentials \
        --set architecture=replication \
        --set primary.resources.limits.memory=4Gi \
        --set primary.resources.limits.cpu=2 \
        --set primary.resources.requests.memory=2Gi \
        --set primary.resources.requests.cpu=1 \
        --set readReplicas.replicaCount=2 \
        --set readReplicas.resources.limits.memory=2Gi \
        --set readReplicas.resources.limits.cpu=1 \
        --set readReplicas.resources.requests.memory=1Gi \
        --set readReplicas.resources.requests.cpu=500m \
        --set metrics.enabled=true \
        --set metrics.serviceMonitor.enabled=true \
        --wait --timeout=600s

    # Staging PostgreSQL (single instance)
    helm upgrade --install postgres bitnami/postgresql \
        --namespace="$NAMESPACE_STAGING" \
        --set auth.database=plato \
        --set auth.username=plato_user \
        --set auth.existingSecret=postgres-credentials \
        --set architecture=standalone \
        --set primary.resources.limits.memory=2Gi \
        --set primary.resources.limits.cpu=1 \
        --set primary.resources.requests.memory=1Gi \
        --set primary.resources.requests.cpu=500m \
        --set metrics.enabled=true \
        --wait --timeout=600s

    log_success "PostgreSQL installed"
}

# Install Redis
install_redis() {
    log_info "Installing Redis..."

    # Production Redis with sentinel
    helm upgrade --install redis bitnami/redis \
        --namespace="$NAMESPACE_PROD" \
        --set auth.existingSecret=redis-credentials \
        --set replica.replicaCount=3 \
        --set sentinel.enabled=true \
        --set metrics.enabled=true \
        --set metrics.serviceMonitor.enabled=true \
        --wait --timeout=600s

    # Staging Redis (single instance)
    helm upgrade --install redis bitnami/redis \
        --namespace="$NAMESPACE_STAGING" \
        --set auth.existingSecret=redis-credentials \
        --set architecture=standalone \
        --set master.resources.limits.memory=1Gi \
        --set master.resources.limits.cpu=500m \
        --set metrics.enabled=true \
        --wait --timeout=600s

    log_success "Redis installed"
}

# Install monitoring stack
install_monitoring() {
    log_info "Installing monitoring stack..."

    # Prometheus and Grafana
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace="$NAMESPACE_MONITORING" \
        --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi \
        --set prometheus.prometheusSpec.retention=30d \
        --set grafana.adminPassword=admin123 \
        --set grafana.persistence.enabled=true \
        --set grafana.persistence.size=10Gi \
        --set alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.resources.requests.storage=10Gi \
        --wait --timeout=900s

    # ElasticSearch
    helm upgrade --install elasticsearch elastic/elasticsearch \
        --namespace="$NAMESPACE_MONITORING" \
        --set replicas=3 \
        --set minimumMasterNodes=2 \
        --set resources.requests.cpu=1000m \
        --set resources.requests.memory=2Gi \
        --set resources.limits.cpu=2000m \
        --set resources.limits.memory=4Gi \
        --set volumeClaimTemplate.resources.requests.storage=100Gi \
        --wait --timeout=900s

    # Kibana
    helm upgrade --install kibana elastic/kibana \
        --namespace="$NAMESPACE_MONITORING" \
        --set resources.requests.cpu=500m \
        --set resources.requests.memory=1Gi \
        --wait --timeout=600s

    # Logstash
    helm upgrade --install logstash elastic/logstash \
        --namespace="$NAMESPACE_MONITORING" \
        --set resources.requests.cpu=500m \
        --set resources.requests.memory=1Gi \
        --wait --timeout=600s

    log_success "Monitoring stack installed"
}

# Configure monitoring
configure_monitoring() {
    log_info "Configuring monitoring..."

    # Apply Prometheus rules
    kubectl apply -f monitoring/prometheus-rules.yml -n "$NAMESPACE_MONITORING"

    # Create ServiceMonitor for Plato
    cat <<EOF | kubectl apply -f -
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: plato-metrics
  namespace: $NAMESPACE_MONITORING
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: plato
  namespaceSelector:
    matchNames:
    - $NAMESPACE_PROD
    - $NAMESPACE_STAGING
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
EOF

    log_success "Monitoring configured"
}

# Deploy network policies
deploy_network_policies() {
    log_info "Deploying network policies..."

    # Network policy for production
    cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: plato-network-policy
  namespace: $NAMESPACE_PROD
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
          name: $NAMESPACE_MONITORING
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: $NAMESPACE_PROD
  - to: []
    ports:
    - protocol: TCP
      port: 443
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
EOF

    log_success "Network policies deployed"
}

# Create RBAC
create_rbac() {
    log_info "Creating RBAC policies..."

    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: plato-service-account
  namespace: $NAMESPACE_PROD
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: $NAMESPACE_PROD
  name: plato-role
rules:
- apiGroups: [""]
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: plato-role-binding
  namespace: $NAMESPACE_PROD
subjects:
- kind: ServiceAccount
  name: plato-service-account
  namespace: $NAMESPACE_PROD
roleRef:
  kind: Role
  name: plato-role
  apiGroup: rbac.authorization.k8s.io
EOF

    log_success "RBAC policies created"
}

# Setup backup jobs
setup_backups() {
    log_info "Setting up backup jobs..."

    # Create backup PVC
    cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: backup-pvc
  namespace: $NAMESPACE_PROD
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Gi
EOF

    # Database backup CronJob
    cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: $NAMESPACE_PROD
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:$POSTGRES_VERSION
            command:
            - /bin/bash
            - -c
            - |
              pg_dump -h postgres-postgresql -U plato_user -d plato \
                | gzip > /backup/plato-\$(date +%Y%m%d-%H%M%S).sql.gz
              # Keep only last 30 days of backups
              find /backup -name "plato-*.sql.gz" -mtime +30 -delete
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
EOF

    log_success "Backup jobs configured"
}

# Main execution
main() {
    log_info "Starting Plato TUI Enterprise Setup..."

    check_prerequisites
    create_namespaces
    generate_secrets
    install_cert_manager
    install_ingress
    install_postgresql
    install_redis
    install_monitoring
    configure_monitoring
    deploy_network_policies
    create_rbac
    setup_backups

    log_success "Enterprise setup completed!"

    echo
    log_info "Next steps:"
    echo "1. Deploy Plato TUI application:"
    echo "   helm upgrade --install plato ./k8s/helm/plato -n $NAMESPACE_PROD"
    echo
    echo "2. Access monitoring dashboards:"
    echo "   Grafana: kubectl port-forward svc/prometheus-grafana 3000:80 -n $NAMESPACE_MONITORING"
    echo "   Kibana: kubectl port-forward svc/kibana-kibana 5601:5601 -n $NAMESPACE_MONITORING"
    echo
    echo "3. Configure DNS to point to ingress:"
    kubectl get svc nginx-ingress-ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
    echo
}

# Run main function
main "$@"