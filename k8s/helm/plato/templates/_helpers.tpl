{{/*
Expand the name of the chart.
*/}}
{{- define "plato.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "plato.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "plato.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "plato.labels" -}}
helm.sh/chart: {{ include "plato.chart" . }}
{{ include "plato.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: plato-tui
{{- end }}

{{/*
Selector labels
*/}}
{{- define "plato.selectorLabels" -}}
app.kubernetes.io/name: {{ include "plato.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "plato.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "plato.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Database URL construction
*/}}
{{- define "plato.databaseUrl" -}}
{{- if .Values.database.enabled }}
{{- printf "postgresql://%s:%s@%s:%d/%s" .Values.database.user "${DATABASE_PASSWORD}" .Values.database.host (.Values.database.port | int) .Values.database.name }}
{{- end }}
{{- end }}

{{/*
Redis URL construction
*/}}
{{- define "plato.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- printf "redis://:%s@%s:%d" "${REDIS_PASSWORD}" .Values.redis.host (.Values.redis.port | int) }}
{{- end }}
{{- end }}

{{/*
Create a default fully qualified PostgreSQL name.
*/}}
{{- define "plato.postgresql.fullname" -}}
{{- include "common.names.dependency.fullname" (dict "chartName" "postgresql" "chartValues" .Values.postgresql "context" $) -}}
{{- end }}

{{/*
Create a default fully qualified Redis name.
*/}}
{{- define "plato.redis.fullname" -}}
{{- include "common.names.dependency.fullname" (dict "chartName" "redis" "chartValues" .Values.redis "context" $) -}}
{{- end }}

{{/*
Validate configuration
*/}}
{{- define "plato.validateValues" -}}
{{- if and .Values.database.enabled (not .Values.database.existingSecret) }}
{{- fail "Database is enabled but no existing secret specified" }}
{{- end }}
{{- if and .Values.redis.enabled (not .Values.redis.existingSecret) }}
{{- fail "Redis is enabled but no existing secret specified" }}
{{- end }}
{{- end }}

{{/*
Generate certificates
*/}}
{{- define "plato.gen-certs" -}}
{{- $altNames := list ( printf "%s.%s" (include "plato.fullname" .) .Release.Namespace ) ( printf "%s.%s.svc" (include "plato.fullname" .) .Release.Namespace ) -}}
{{- $ca := genCA "plato-ca" 365 -}}
{{- $cert := genSignedCert ( include "plato.fullname" . ) nil $altNames 365 $ca -}}
tls.crt: {{ $cert.Cert | b64enc }}
tls.key: {{ $cert.Key | b64enc }}
ca.crt: {{ $ca.Cert | b64enc }}
{{- end }}