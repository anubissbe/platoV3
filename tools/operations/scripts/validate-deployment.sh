#!/bin/bash

# Deployment Validation Script for Plato TUI Enterprise
# Comprehensive validation of all infrastructure components

set -euo pipefail

# Configuration
NAMESPACE_PROD="plato-production"
NAMESPACE_STAGING="plato-staging"
NAMESPACE_MONITORING="plato-monitoring"
DOMAIN="${DOMAIN:-plato.example.com}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED_CHECKS++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNING_CHECKS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED_CHECKS++))
}

# Test function wrapper
run_test() {
    local test_name="$1"
    local test_command="$2"

    ((TOTAL_CHECKS++))

    if eval "$test_command" &>/dev/null; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name"
        return 1
    fi
}

# Validate Kubernetes cluster
validate_cluster() {
    log_info "=== Validating Kubernetes Cluster ==="

    run_test "Kubernetes cluster connectivity" "kubectl cluster-info"
    run_test "Cluster nodes ready" "kubectl get nodes -o jsonpath='{.items[*].status.conditions[?(@.type==\"Ready\")].status}' | grep -v False"
    run_test "CoreDNS running" "kubectl get pods -n kube-system -l k8s-app=kube-dns --field-selector=status.phase=Running"
    run_test "CNI plugin operational" "kubectl get pods -n kube-system --field-selector=status.phase=Running | grep -E '(flannel|calico|weave|cilium)'"
}

# Validate namespaces
validate_namespaces() {
    log_info "=== Validating Namespaces ==="

    local namespaces=("$NAMESPACE_PROD" "$NAMESPACE_STAGING" "$NAMESPACE_MONITORING" "cert-manager" "ingress-nginx")

    for ns in "${namespaces[@]}"; do
        run_test "Namespace $ns exists" "kubectl get namespace $ns"
        run_test "Namespace $ns is active" "kubectl get namespace $ns -o jsonpath='{.status.phase}' | grep -q Active"
    done
}

# Validate secrets
validate_secrets() {
    log_info "=== Validating Secrets ==="

    run_test "PostgreSQL credentials exist (prod)" "kubectl get secret postgres-credentials -n $NAMESPACE_PROD"
    run_test "Redis credentials exist (prod)" "kubectl get secret redis-credentials -n $NAMESPACE_PROD"
    run_test "Application secrets exist (prod)" "kubectl get secret plato-secrets -n $NAMESPACE_PROD"

    run_test "PostgreSQL credentials exist (staging)" "kubectl get secret postgres-credentials -n $NAMESPACE_STAGING"
    run_test "Redis credentials exist (staging)" "kubectl get secret redis-credentials -n $NAMESPACE_STAGING"
}

# Validate cert-manager
validate_cert_manager() {
    log_info "=== Validating Certificate Management ==="

    run_test "cert-manager deployment ready" "kubectl get deployment cert-manager -n cert-manager -o jsonpath='{.status.readyReplicas}' | grep -q '[1-9]'"
    run_test "cert-manager webhook ready" "kubectl get deployment cert-manager-webhook -n cert-manager -o jsonpath='{.status.readyReplicas}' | grep -q '[1-9]'"
    run_test "cert-manager cainjector ready" "kubectl get deployment cert-manager-cainjector -n cert-manager -o jsonpath='{.status.readyReplicas}' | grep -q '[1-9]'"
    run_test "ClusterIssuer configured" "kubectl get clusterissuer letsencrypt-prod"
}

# Validate ingress controller
validate_ingress() {
    log_info "=== Validating Ingress Controller ==="

    run_test "NGINX ingress controller running" "kubectl get pods -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --field-selector=status.phase=Running"
    run_test "Ingress controller service exists" "kubectl get service nginx-ingress-ingress-nginx-controller -n ingress-nginx"

    # Check if LoadBalancer has external IP
    local external_ip
    external_ip=$(kubectl get service nginx-ingress-ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")

    if [[ -n "$external_ip" && "$external_ip" != "null" ]]; then
        log_success "LoadBalancer has external IP: $external_ip"
        ((PASSED_CHECKS++))
    else
        log_warn "LoadBalancer external IP not assigned (may be expected in some environments)"
        ((WARNING_CHECKS++))
    fi

    ((TOTAL_CHECKS++))
}

# Validate database
validate_database() {
    log_info "=== Validating Database ==="

    run_test "PostgreSQL production deployment" "kubectl get deployment postgres-postgresql -n $NAMESPACE_PROD"
    run_test "PostgreSQL production pods running" "kubectl get pods -n $NAMESPACE_PROD -l app.kubernetes.io/name=postgresql --field-selector=status.phase=Running"

    # Test database connectivity
    if kubectl exec -it postgres-postgresql-0 -n $NAMESPACE_PROD -- \
       psql -U plato_user -d plato -c "SELECT version();" &>/dev/null; then
        log_success "Database connectivity test"
        ((PASSED_CHECKS++))
    else
        log_error "Database connectivity test"
        ((FAILED_CHECKS++))
    fi

    ((TOTAL_CHECKS++))

    # Check database metrics
    run_test "PostgreSQL metrics exporter" "kubectl get pods -n $NAMESPACE_PROD -l app.kubernetes.io/component=metrics"
}

# Validate Redis
validate_redis() {
    log_info "=== Validating Redis Cache ==="

    run_test "Redis production deployment" "kubectl get statefulset redis-master -n $NAMESPACE_PROD"
    run_test "Redis production pods running" "kubectl get pods -n $NAMESPACE_PROD -l app.kubernetes.io/name=redis --field-selector=status.phase=Running"

    # Test Redis connectivity
    if kubectl exec -it redis-master-0 -n $NAMESPACE_PROD -- redis-cli ping 2>/dev/null | grep -q PONG; then
        log_success "Redis connectivity test"
        ((PASSED_CHECKS++))
    else
        log_error "Redis connectivity test"
        ((FAILED_CHECKS++))
    fi

    ((TOTAL_CHECKS++))
}

# Validate monitoring stack
validate_monitoring() {
    log_info "=== Validating Monitoring Stack ==="

    # Prometheus
    run_test "Prometheus deployment" "kubectl get deployment prometheus-kube-prometheus-prometheus-operator -n $NAMESPACE_MONITORING"
    run_test "Prometheus StatefulSet" "kubectl get statefulset prometheus-prometheus-kube-prometheus-prometheus -n $NAMESPACE_MONITORING"

    # Grafana
    run_test "Grafana deployment" "kubectl get deployment prometheus-grafana -n $NAMESPACE_MONITORING"

    # AlertManager
    run_test "AlertManager StatefulSet" "kubectl get statefulset alertmanager-prometheus-kube-prometheus-alertmanager -n $NAMESPACE_MONITORING"

    # ELK Stack
    run_test "ElasticSearch StatefulSet" "kubectl get statefulset elasticsearch-master -n $NAMESPACE_MONITORING"
    run_test "Kibana deployment" "kubectl get deployment kibana-kibana -n $NAMESPACE_MONITORING"

    # Check if Prometheus is collecting metrics
    if kubectl port-forward svc/prometheus-kube-prometheus-prometheus 9090:9090 -n $NAMESPACE_MONITORING &
       sleep 5
       if curl -s "http://localhost:9090/api/v1/targets" | grep -q '"health":"up"'; then
           log_success "Prometheus targets healthy"
           ((PASSED_CHECKS++))
       else
           log_warn "Some Prometheus targets may be down"
           ((WARNING_CHECKS++))
       fi
       pkill -f "port-forward.*prometheus" || true
       ((TOTAL_CHECKS++))
    fi
}

# Validate network policies
validate_network_policies() {
    log_info "=== Validating Network Policies ==="

    run_test "Network policies exist (prod)" "kubectl get networkpolicy -n $NAMESPACE_PROD"

    # Check if NetworkPolicy CRD exists
    if kubectl get crd networkpolicies.networking.k8s.io &>/dev/null; then
        log_success "NetworkPolicy CRD exists"
        ((PASSED_CHECKS++))
    else
        log_warn "NetworkPolicy CRD not found (may not be supported by CNI)"
        ((WARNING_CHECKS++))
    fi

    ((TOTAL_CHECKS++))
}

# Validate RBAC
validate_rbac() {
    log_info "=== Validating RBAC ==="

    run_test "Service accounts exist (prod)" "kubectl get serviceaccount -n $NAMESPACE_PROD"
    run_test "Roles exist (prod)" "kubectl get role -n $NAMESPACE_PROD"
    run_test "RoleBindings exist (prod)" "kubectl get rolebinding -n $NAMESPACE_PROD"

    # Test service account permissions
    if kubectl auth can-i get configmaps --as=system:serviceaccount:$NAMESPACE_PROD:plato-service-account -n $NAMESPACE_PROD; then
        log_success "Service account permissions configured"
        ((PASSED_CHECKS++))
    else
        log_warn "Service account permissions may need review"
        ((WARNING_CHECKS++))
    fi

    ((TOTAL_CHECKS++))
}

# Validate backup configuration
validate_backups() {
    log_info "=== Validating Backup Configuration ==="

    run_test "Backup PVC exists" "kubectl get pvc backup-pvc -n $NAMESPACE_PROD"
    run_test "Backup CronJob configured" "kubectl get cronjob postgres-backup -n $NAMESPACE_PROD"

    # Check backup schedule
    local schedule
    schedule=$(kubectl get cronjob postgres-backup -n $NAMESPACE_PROD -o jsonpath='{.spec.schedule}' 2>/dev/null || echo "")

    if [[ -n "$schedule" ]]; then
        log_success "Backup schedule configured: $schedule"
        ((PASSED_CHECKS++))
    else
        log_error "Backup schedule not configured"
        ((FAILED_CHECKS++))
    fi

    ((TOTAL_CHECKS++))
}

# Performance validation
validate_performance() {
    log_info "=== Validating Performance Configuration ==="

    # Check HPA configuration
    if kubectl get hpa -n $NAMESPACE_PROD &>/dev/null; then
        log_success "Horizontal Pod Autoscaler configured"
        ((PASSED_CHECKS++))
    else
        log_warn "HPA not configured (may be intentional)"
        ((WARNING_CHECKS++))
    fi

    ((TOTAL_CHECKS++))

    # Check resource limits
    local pods_with_limits
    pods_with_limits=$(kubectl get pods -n $NAMESPACE_PROD -o jsonpath='{range .items[*]}{.spec.containers[*].resources.limits}{"\n"}{end}' | grep -c "map\|{" || echo "0")

    if [[ "$pods_with_limits" -gt 0 ]]; then
        log_success "Resource limits configured for pods"
        ((PASSED_CHECKS++))
    else
        log_warn "Resource limits not configured"
        ((WARNING_CHECKS++))
    fi

    ((TOTAL_CHECKS++))
}

# Security validation
validate_security() {
    log_info "=== Validating Security Configuration ==="

    # Check Pod Security Policies or Pod Security Standards
    if kubectl get podsecuritypolicy &>/dev/null; then
        log_success "Pod Security Policies configured"
        ((PASSED_CHECKS++))
    elif kubectl api-resources | grep -q "podsecuritypolicies"; then
        log_warn "Pod Security Policies available but not configured"
        ((WARNING_CHECKS++))
    else
        log_info "Pod Security Standards may be in use (PSPs deprecated)"
    fi

    ((TOTAL_CHECKS++))

    # Check for non-root containers
    local non_root_pods
    non_root_pods=$(kubectl get pods -n $NAMESPACE_PROD -o jsonpath='{range .items[*]}{.spec.securityContext.runAsNonRoot}{"\n"}{end}' | grep -c "true" || echo "0")

    if [[ "$non_root_pods" -gt 0 ]]; then
        log_success "Non-root security context configured"
        ((PASSED_CHECKS++))
    else
        log_warn "Non-root security context not configured"
        ((WARNING_CHECKS++))
    fi

    ((TOTAL_CHECKS++))
}

# Application-specific validation
validate_application() {
    log_info "=== Validating Application Deployment ==="

    # Check if Plato application is deployed
    if kubectl get deployment plato -n $NAMESPACE_PROD &>/dev/null; then
        run_test "Plato application deployed (prod)" "kubectl get deployment plato -n $NAMESPACE_PROD"
        run_test "Plato pods running (prod)" "kubectl get pods -n $NAMESPACE_PROD -l app.kubernetes.io/name=plato --field-selector=status.phase=Running"

        # Check service
        run_test "Plato service exists (prod)" "kubectl get service plato -n $NAMESPACE_PROD"

        # Check ingress
        if kubectl get ingress plato -n $NAMESPACE_PROD &>/dev/null; then
            log_success "Plato ingress configured"
            ((PASSED_CHECKS++))
        else
            log_warn "Plato ingress not configured"
            ((WARNING_CHECKS++))
        fi

        ((TOTAL_CHECKS++))

    else
        log_info "Plato application not yet deployed (infrastructure validation only)"
    fi
}

# Connectivity tests
validate_connectivity() {
    log_info "=== Validating Connectivity ==="

    # Test internal DNS resolution
    if kubectl run test-dns --image=busybox --rm -i --restart=Never -- \
       nslookup kubernetes.default.svc.cluster.local &>/dev/null; then
        log_success "Internal DNS resolution"
        ((PASSED_CHECKS++))
    else
        log_error "Internal DNS resolution"
        ((FAILED_CHECKS++))
    fi

    ((TOTAL_CHECKS++))

    # Test external connectivity
    if kubectl run test-external --image=busybox --rm -i --restart=Never -- \
       wget -q --spider http://www.google.com &>/dev/null; then
        log_success "External connectivity"
        ((PASSED_CHECKS++))
    else
        log_warn "External connectivity (may be restricted by network policies)"
        ((WARNING_CHECKS++))
    fi

    ((TOTAL_CHECKS++))
}

# Main validation function
main() {
    log_info "Starting Plato TUI Enterprise Deployment Validation"
    log_info "========================================================="

    validate_cluster
    validate_namespaces
    validate_secrets
    validate_cert_manager
    validate_ingress
    validate_database
    validate_redis
    validate_monitoring
    validate_network_policies
    validate_rbac
    validate_backups
    validate_performance
    validate_security
    validate_application
    validate_connectivity

    echo
    log_info "========================================================="
    log_info "Validation Summary:"
    echo -e "  Total checks: ${BLUE}$TOTAL_CHECKS${NC}"
    echo -e "  Passed: ${GREEN}$PASSED_CHECKS${NC}"
    echo -e "  Warnings: ${YELLOW}$WARNING_CHECKS${NC}"
    echo -e "  Failed: ${RED}$FAILED_CHECKS${NC}"

    local success_rate
    success_rate=$(( (PASSED_CHECKS * 100) / TOTAL_CHECKS ))
    echo -e "  Success rate: ${success_rate}%"

    if [[ $FAILED_CHECKS -eq 0 ]]; then
        log_success "Enterprise deployment validation completed successfully!"
        if [[ $WARNING_CHECKS -gt 0 ]]; then
            log_warn "Some warnings detected - review recommended"
        fi
        exit 0
    else
        log_error "Validation failed with $FAILED_CHECKS critical issues"
        echo
        log_info "Please address the failed checks before proceeding to production"
        exit 1
    fi
}

# Run validation
main "$@"