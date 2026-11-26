// Package otel exports metrics over OTLP when an endpoint is configured.
package otel

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"

	"github.com/galaxy-io/alchemy/internal/telemetry"
	"github.com/galaxy-io/alchemy/internal/version"
)

const (
	scope = "github.com/galaxy-io/alchemy"

	sdkDisabledEnv     = "OTEL_SDK_DISABLED"
	endpointEnv        = "OTEL_EXPORTER_OTLP_ENDPOINT"
	metricsEndpointEnv = "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"
	protocolEnv        = "OTEL_EXPORTER_OTLP_PROTOCOL"
	metricsProtocolEnv = "OTEL_EXPORTER_OTLP_METRICS_PROTOCOL"
	metricsExporterEnv = "OTEL_METRICS_EXPORTER"

	exporterNone = "none"
	protocolGRPC = "grpc"
	protocolHTTP = "http/protobuf"

	flushTimeout = 10 * time.Second
)

// FromEnv builds the metrics Set and its flush. Metrics export over OTLP when
// OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_EXPORTER_OTLP_METRICS_ENDPOINT is set,
// unless OTEL_SDK_DISABLED is true or OTEL_METRICS_EXPORTER is none. With
// export off the Set is nil and records nothing. The transport is
// OTEL_EXPORTER_OTLP_METRICS_PROTOCOL, else OTEL_EXPORTER_OTLP_PROTOCOL, else
// gRPC, and the exporter and resource read the other standard OTEL_*
// variables. Errors the SDK meets, such as failed exports, are logged to log
// at warn level. flush exports what is left, waiting at most 10 seconds. Only
// metrics are exported.
func FromEnv(ctx context.Context, log *slog.Logger) (*telemetry.Set, func(), error) {
	if !exports() {
		return nil, func() {}, nil
	}
	otel.SetErrorHandler(otel.ErrorHandlerFunc(func(err error) {
		log.Warn("opentelemetry", "err", err)
	}))
	exporter, err := newExporter(ctx)
	if err != nil {
		return nil, nil, err
	}
	provider := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(processResource()),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exporter)),
	)
	flush := func() {
		ctx, cancel := context.WithTimeout(context.Background(), flushTimeout)
		defer cancel()
		if err := provider.Shutdown(ctx); err != nil {
			log.Warn("flush metrics", "err", err)
		}
	}
	meter := provider.Meter(scope, metric.WithInstrumentationVersion(version.Version))
	return telemetry.New(backend{m: meter}), flush, nil
}

func exports() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv(sdkDisabledEnv)), "true") {
		return false
	}
	if strings.TrimSpace(os.Getenv(metricsExporterEnv)) == exporterNone {
		return false
	}
	return os.Getenv(endpointEnv) != "" || os.Getenv(metricsEndpointEnv) != ""
}

func newExporter(ctx context.Context) (sdkmetric.Exporter, error) {
	var exporter sdkmetric.Exporter
	var err error
	switch env, protocol := metricsProtocol(); protocol {
	case protocolGRPC:
		exporter, err = otlpmetricgrpc.New(ctx)
	case protocolHTTP:
		exporter, err = otlpmetrichttp.New(ctx)
	default:
		return nil, fmt.Errorf("otel: unknown %s %q (%s, %s)", env, protocol, protocolGRPC, protocolHTTP)
	}
	if err != nil {
		return nil, fmt.Errorf("otel: metric exporter: %w", err)
	}
	return exporter, nil
}

func metricsProtocol() (env, protocol string) {
	for _, env := range []string{metricsProtocolEnv, protocolEnv} {
		if v := strings.TrimSpace(os.Getenv(env)); v != "" {
			return env, v
		}
	}
	return "", protocolGRPC
}

// processResource is the default resource with the hostname as the instance
// id, so replicas of one service export separate series, and the build
// version as the service version. Either one set in OTEL_RESOURCE_ATTRIBUTES
// wins.
func processResource() *resource.Resource {
	attrs := []attribute.KeyValue{semconv.ServiceVersion(version.Version)}
	if hostname, err := os.Hostname(); err == nil {
		attrs = append(attrs, semconv.ServiceInstanceID(hostname))
	}
	merged, err := resource.Merge(resource.NewSchemaless(attrs...), resource.Default())
	if err != nil {
		return resource.Default()
	}
	return merged
}
