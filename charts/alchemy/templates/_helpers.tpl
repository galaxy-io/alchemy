{{- define "alchemy.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "alchemy.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "alchemy.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "alchemy.labels" -}}
helm.sh/chart: {{ include "alchemy.chart" . }}
{{ include "alchemy.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "alchemy.namespace" -}}
{{- .Values.namespaceOverride | default .Release.Namespace -}}
{{- end -}}

{{- define "alchemy.selectorLabels" -}}
app.kubernetes.io/name: {{ include "alchemy.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}


{{- define "alchemy.server.fullname" -}}
{{- printf "%s-server" (include "alchemy.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "alchemy.server.labels" -}}
{{ include "alchemy.labels" . }}
app.kubernetes.io/component: server
{{- end -}}

{{- define "alchemy.server.selectorLabels" -}}
{{ include "alchemy.selectorLabels" . }}
app.kubernetes.io/component: server
{{- end -}}

{{- define "alchemy.server.serviceAccountName" -}}
{{- .Values.server.serviceAccount.name | default (include "alchemy.server.fullname" .) -}}
{{- end -}}


{{- define "alchemy.host.fullname" -}}
{{- printf "%s-host" (include "alchemy.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "alchemy.host.labels" -}}
{{ include "alchemy.labels" . }}
app.kubernetes.io/component: host
{{- end -}}

{{- define "alchemy.host.selectorLabels" -}}
{{ include "alchemy.selectorLabels" . }}
app.kubernetes.io/component: host
{{- end -}}

{{- define "alchemy.host.serviceAccountName" -}}
{{- .Values.host.serviceAccount.name | default (include "alchemy.host.fullname" .) -}}
{{- end -}}


{{/* User's existingSecret, else the chart's own Secret. */}}
{{- define "alchemy.secretName" -}}
{{- .Values.existingSecret | default (printf "%s-runtime" (include "alchemy.fullname" .)) -}}
{{- end -}}
