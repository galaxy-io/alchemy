// Package telemetry declares every metric Alchemy records and the events
// that record them. A Backend turns them into a metrics system's instruments.
package telemetry

import "context"

// Kind is the kind of instrument a metric is recorded with.
type Kind int

const (
	// KindCounter only goes up.
	KindCounter Kind = iota
	// KindHistogram records a distribution of values.
	KindHistogram
	// KindGauge holds the last value set.
	KindGauge
	// KindObservableGauge is read from current state each time metrics are
	// collected.
	KindObservableGauge
)

func (k Kind) String() string {
	switch k {
	case KindCounter:
		return "counter"
	case KindHistogram:
		return "histogram"
	case KindGauge:
		return "gauge"
	default:
		return "observable gauge"
	}
}

// Desc declares one metric: its name, its unit, what it measures and its
// attribute keys, in the order values are given when it is recorded. An empty
// attribute value means the attribute does not apply to that measurement and
// is left off.
type Desc struct {
	Name string
	// Unit is the metric's UCUM unit, such as "s", "By" or "{invocation}".
	Unit       string
	Help       string
	Kind       Kind
	Attributes []string
	// Buckets are a histogram's bucket bounds, and nil for the backend's
	// default.
	Buckets []float64
}

// Backend makes the instrument each metric is recorded with. It is asked once
// per counter, histogram and gauge, when a Set is built, and once per group
// of observable gauges, when a Set starts watching what they read.
type Backend interface {
	Counter(Desc) Counter
	Histogram(Desc) Histogram
	Gauge(Desc) Gauge
	Observe(read func(context.Context, Observer), gauges ...Desc) error
}

// Counter adds to a metric. values are its attribute values, in
// Desc.Attributes order, and ctx is the context the measurement is made in.
type Counter interface {
	Add(ctx context.Context, v float64, values ...string)
}

// Histogram records one observation of a metric.
type Histogram interface {
	Observe(ctx context.Context, v float64, values ...string)
}

// Gauge sets a metric's current value, which is reported until it is set
// again.
type Gauge interface {
	Set(ctx context.Context, v float64, values ...string)
}

// Observer takes the current values of observable gauges while metrics are
// collected. A gauge series not set in a collection is not reported.
type Observer interface {
	Set(gauge Desc, v float64, values ...string)
}

var catalog []Desc

// Catalog returns every metric Alchemy records.
func Catalog() []Desc {
	return append([]Desc(nil), catalog...)
}

func declare(kind Kind, name, unit, help string, buckets []float64, attributes []string) Desc {
	d := Desc{Name: name, Unit: unit, Help: help, Kind: kind, Attributes: attributes, Buckets: buckets}
	catalog = append(catalog, d)
	return d
}

func counter(name, unit, help string, attributes ...string) Desc {
	return declare(KindCounter, name, unit, help, nil, attributes)
}

func duration(name, help string, buckets []float64, attributes ...string) Desc {
	return declare(KindHistogram, name, unitSeconds, help, buckets, attributes)
}

func gauge(name, unit, help string, attributes ...string) Desc {
	return declare(KindObservableGauge, name, unit, help, nil, attributes)
}

func timestamp(name, help string, attributes ...string) Desc {
	return declare(KindGauge, name, unitSeconds, help, nil, attributes)
}
