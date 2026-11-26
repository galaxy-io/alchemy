package otel

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	noopmetric "go.opentelemetry.io/otel/metric/noop"

	"github.com/galaxy-io/alchemy/internal/telemetry"
)

type backend struct{ m metric.Meter }

var _ telemetry.Backend = backend{}

func (b backend) Counter(d telemetry.Desc) telemetry.Counter {
	c, err := b.m.Float64Counter(d.Name, metric.WithDescription(d.Help), metric.WithUnit(d.Unit))
	if err != nil {
		c, _ = noopmetric.Meter{}.Float64Counter(d.Name)
	}
	return counter{c: c, keys: d.Attributes}
}

func (b backend) Histogram(d telemetry.Desc) telemetry.Histogram {
	opts := []metric.Float64HistogramOption{metric.WithDescription(d.Help), metric.WithUnit(d.Unit)}
	if len(d.Buckets) > 0 {
		opts = append(opts, metric.WithExplicitBucketBoundaries(d.Buckets...))
	}
	h, err := b.m.Float64Histogram(d.Name, opts...)
	if err != nil {
		h, _ = noopmetric.Meter{}.Float64Histogram(d.Name)
	}
	return histogram{h: h, keys: d.Attributes}
}

func (b backend) Gauge(d telemetry.Desc) telemetry.Gauge {
	g, err := b.m.Float64Gauge(d.Name, metric.WithDescription(d.Help), metric.WithUnit(d.Unit))
	if err != nil {
		g, _ = noopmetric.Meter{}.Float64Gauge(d.Name)
	}
	return gauge{g: g, keys: d.Attributes}
}

func (b backend) Observe(read func(context.Context, telemetry.Observer), gauges ...telemetry.Desc) error {
	instruments := make(map[string]observable, len(gauges))
	observables := make([]metric.Observable, 0, len(gauges))
	for _, d := range gauges {
		g, err := b.m.Float64ObservableGauge(d.Name, metric.WithDescription(d.Help), metric.WithUnit(d.Unit))
		if err != nil {
			return fmt.Errorf("otel: gauge %s: %w", d.Name, err)
		}
		instruments[d.Name] = observable{g: g, keys: d.Attributes}
		observables = append(observables, g)
	}
	_, err := b.m.RegisterCallback(func(ctx context.Context, o metric.Observer) error {
		read(ctx, observer{o: o, gauges: instruments})
		return nil
	}, observables...)
	return err
}

type counter struct {
	c    metric.Float64Counter
	keys []string
}

func (c counter) Add(ctx context.Context, v float64, values ...string) {
	c.c.Add(ctx, v, attrs(c.keys, values))
}

type histogram struct {
	h    metric.Float64Histogram
	keys []string
}

func (h histogram) Observe(ctx context.Context, v float64, values ...string) {
	h.h.Record(ctx, v, attrs(h.keys, values))
}

type gauge struct {
	g    metric.Float64Gauge
	keys []string
}

func (g gauge) Set(ctx context.Context, v float64, values ...string) {
	g.g.Record(ctx, v, attrs(g.keys, values))
}

type observable struct {
	g    metric.Float64ObservableGauge
	keys []string
}

type observer struct {
	o      metric.Observer
	gauges map[string]observable
}

func (o observer) Set(d telemetry.Desc, v float64, values ...string) {
	g, ok := o.gauges[d.Name]
	if !ok {
		return
	}
	o.o.ObserveFloat64(g.g, v, attrs(g.keys, values))
}

// attrs pairs a metric's attribute keys with one measurement's values. A
// value with no key, a key with no value, or an empty value is left out.
func attrs(keys, values []string) metric.MeasurementOption {
	n := min(len(keys), len(values))
	kvs := make([]attribute.KeyValue, 0, n)
	for i := range n {
		if values[i] != "" {
			kvs = append(kvs, attribute.String(keys[i], values[i]))
		}
	}
	if len(kvs) == 0 {
		return unlabeled
	}
	return metric.WithAttributeSet(attribute.NewSet(kvs...))
}

var unlabeled = metric.WithAttributeSet(*attribute.EmptySet())
