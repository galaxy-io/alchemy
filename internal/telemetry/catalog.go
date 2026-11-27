package telemetry

import (
	"context"
	"strings"
	"time"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

const (
	attrFunction           = "alchemy.function.id"
	attrInvocationStatus   = "alchemy.invocation.status"
	attrInvocationMode     = "alchemy.invocation.mode"
	attrStartKind          = "alchemy.start.kind"
	attrBuildStatus        = "alchemy.build.status"
	attrRuntime            = "alchemy.runtime.name"
	attrErrorType          = "error.type"
	attrHandbackReason     = "alchemy.handback.reason"
	attrEvictionReason     = "alchemy.eviction.reason"
	attrInstancePurpose    = "alchemy.instance.purpose"
	attrInstanceState      = "alchemy.instance.state"
	attrFirecrackerVersion = "alchemy.firecracker.version"
	attrKernel             = "alchemy.guest.kernel"
)

const (
	unitSeconds     = "s"
	unitBytes       = "By"
	unitInvocations = "{invocation}"
	unitRetries     = "{retry}"
	unitHandbacks   = "{handback}"
	unitCalls       = "{call}"
	unitBuilds      = "{build}"
	unitCompiles    = "{compile}"
	unitRecords     = "{record}"
	unitInstances   = "{instance}"
	unitVersions    = "{version}"
	unitSlots       = "{slot}"
	unitImages      = "{image}"
)

const (
	modeSync  = "sync"
	modeAsync = "async"

	startKindNone = "none"

	statusReady  = "ready"
	statusFailed = "failed"

	queueDepthTimeout = 5 * time.Second
)

// Part is a part of Alchemy that records counters of its own.
type Part int

// The parts that record counters known before anything happens.
const (
	Server Part = iota
	Host
)

// RuntimeImage is the runtime of a version built from an image of its own.
const RuntimeImage = "image"

// BuildFailure is why a function build failed.
type BuildFailure string

// A function build fails reading its spec, compiling its source or building
// its image, or because the platform had no host for it or ran out of time.
const (
	BuildFailedSpec    BuildFailure = "spec"
	BuildFailedCompile BuildFailure = "compile"
	BuildFailedBuild   BuildFailure = "build"
	BuildFailedNoHost  BuildFailure = "no_host"
	BuildFailedTimeout BuildFailure = "timeout"
)

// HandbackReason is why a host gave an invocation back to the queue without
// running it.
type HandbackReason string

// Reasons a host hands an invocation back.
const (
	HandbackNoRoom      HandbackReason = "no_room"
	HandbackConcurrency HandbackReason = "concurrency_limit"
)

// Purpose is what an instance was started for.
type Purpose string

// Purposes an instance is started for.
const (
	PurposeInvocation Purpose = "invocation"
	PurposePrewarm    Purpose = "prewarm"
)

// EvictionReason is why a warm instance was released.
type EvictionReason string

// Reasons a warm instance is released.
const (
	EvictedForMemory  EvictionReason = "memory"
	EvictedForIdle    EvictionReason = "idle"
	EvictedForVersion EvictionReason = "version"
)

var (
	phaseBuckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600}
	queueBuckets = []float64{0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60, 300, 600, 1800, 3600}
	buildBuckets = []float64{1, 2, 5, 10, 20, 30, 60, 120, 300, 600}
)

var (
	invocations     = counter("alchemy.invocations", unitInvocations, "Invocations that ended.", attrFunction, attrInvocationStatus, attrInvocationMode, attrStartKind)
	failures        = counter("alchemy.invocation.failures", unitInvocations, "Invocations that ended with a function error, by kind.", attrFunction, attrErrorType)
	runDuration     = duration("alchemy.invocation.run.duration", "How long the function ran.", phaseBuckets, attrFunction, attrInvocationStatus)
	acquireDuration = duration("alchemy.invocation.acquire.duration", "How long it took to have a microVM ready for an invocation.", phaseBuckets, attrFunction, attrStartKind)
	queueDuration   = duration("alchemy.invocation.queue.duration", "How long an invocation waited before a host had room to start it.", queueBuckets)
	retries         = counter("alchemy.invocation.retries", unitRetries, "Failed attempts that run again.", attrFunction)
	handbacks       = counter("alchemy.invocation.handbacks", unitHandbacks, "Invocations a host gave back to the queue without running.", attrHandbackReason)
	inputSize       = counter("alchemy.invocation.input.size", unitBytes, "Bytes of input of ended invocations.", attrFunction)
	outputSize      = counter("alchemy.invocation.output.size", unitBytes, "Bytes of output of ended invocations.", attrFunction)
	callDuration    = duration("alchemy.invoke.duration", "How long a caller waited for a synchronous invocation.", phaseBuckets, attrFunction, attrInvocationStatus)
	replays         = counter("alchemy.invoke.replays", unitCalls, "Calls answered with an earlier invocation's result by idempotency key.", attrFunction)

	builds        = counter("alchemy.function.builds", unitBuilds, "Function version builds that ended.", attrFunction, attrBuildStatus, attrRuntime, attrErrorType)
	buildDuration = duration("alchemy.function.build.duration", "How long a function version build took.", buildBuckets, attrBuildStatus, attrRuntime)
	buildResumes  = counter("alchemy.function.build.resumes", unitBuilds, "Builds taken over from a server that left them.")
	buildFailedAt = timestamp("alchemy.function.build.last_failure.time", "When a function's build last failed, as a Unix timestamp.", attrFunction)

	recordsWritten = counter("alchemy.records.written", unitRecords, "Invocation records written to the database.")
	recordsRefused = counter("alchemy.records.refused", unitRecords, "Invocation records the database refused, which are dropped.")
	queueWaiting   = gauge("alchemy.queue.waiting", unitInvocations, "Invocations queued that no host has taken.")
	queueRunning   = gauge("alchemy.queue.running", unitInvocations, "Invocations hosts hold.")

	hostBuilds        = counter("alchemy.host.builds", unitBuilds, "Artifact builds on a host that ended.", attrBuildStatus)
	hostBuildDuration = duration("alchemy.host.build.duration", "How long an artifact build on a host took.", buildBuckets, attrBuildStatus)
	hostCompiles      = counter("alchemy.host.compiles", unitCompiles, "Source compiles on a host that ended.", attrBuildStatus)

	instanceStarts   = counter("alchemy.host.instance.starts", unitInstances, "MicroVMs booted or restored.", attrStartKind, attrInstancePurpose)
	warmEvictions    = counter("alchemy.host.warm.evictions", unitInstances, "Warm microVMs released.", attrEvictionReason)
	versionEvictions = counter("alchemy.host.version.evictions", unitVersions, "Function versions a host stopped serving.")

	running         = gauge("alchemy.host.invocations", unitInvocations, "Invocations running on a host, by function.", attrFunction)
	slots           = gauge("alchemy.host.slots", unitSlots, "Invocations a host can hold at once.")
	busySlots       = gauge("alchemy.host.busy_slots", unitSlots, "Invocations a host holds.")
	memoryBudget    = gauge("alchemy.host.memory.budget", unitBytes, "Guest memory a host may commit, 0 for no limit.")
	memoryCommitted = gauge("alchemy.host.memory.committed", unitBytes, "Guest memory of a host's live microVMs.")
	instances       = gauge("alchemy.host.instances", unitInstances, "MicroVMs on a host, by state.", attrInstanceState)
	artifacts       = gauge("alchemy.host.artifacts", unitVersions, "Function versions a host serves.")
	cacheSize       = gauge("alchemy.host.rootfs.cache.size", unitBytes, "Size of a host's root filesystem cache.")
	cacheImages     = gauge("alchemy.host.rootfs.cache.images", unitImages, "Images in a host's root filesystem cache.")
	hostInfo        = gauge("alchemy.host.info", "", "Always 1, with what a host runs as attributes.", attrFirecrackerVersion, attrKernel)
)

// Set records Alchemy's metrics. Build one with New. A nil Set records
// nothing, so callers never check for one. The server and hosts each record
// the events of their own.
type Set struct {
	b Backend

	invocations, failures, retries, handbacks, inputSize, outputSize, replays Counter
	runDuration, acquireDuration, queueDuration, callDuration                 Histogram

	builds, buildResumes Counter
	buildDuration        Histogram
	buildFailedAt        Gauge

	recordsWritten, recordsRefused Counter

	hostBuilds, hostCompiles Counter
	hostBuildDuration        Histogram

	instanceStarts, warmEvictions, versionEvictions Counter
}

// New binds every counter and histogram to an instrument of b. Gauges are
// bound when a Set starts watching what they read.
func New(b Backend) *Set {
	return &Set{
		b: b,

		invocations:     b.Counter(invocations),
		failures:        b.Counter(failures),
		retries:         b.Counter(retries),
		handbacks:       b.Counter(handbacks),
		inputSize:       b.Counter(inputSize),
		outputSize:      b.Counter(outputSize),
		replays:         b.Counter(replays),
		runDuration:     b.Histogram(runDuration),
		acquireDuration: b.Histogram(acquireDuration),
		queueDuration:   b.Histogram(queueDuration),
		callDuration:    b.Histogram(callDuration),

		builds:        b.Counter(builds),
		buildResumes:  b.Counter(buildResumes),
		buildDuration: b.Histogram(buildDuration),
		buildFailedAt: b.Gauge(buildFailedAt),

		recordsWritten: b.Counter(recordsWritten),
		recordsRefused: b.Counter(recordsRefused),

		hostBuilds:        b.Counter(hostBuilds),
		hostCompiles:      b.Counter(hostCompiles),
		hostBuildDuration: b.Histogram(hostBuildDuration),

		instanceStarts:   b.Counter(instanceStarts),
		warmEvictions:    b.Counter(warmEvictions),
		versionEvictions: b.Counter(versionEvictions),
	}
}

// Started records a zero for the counters part records whose attributes are
// none or one of a few known values. A counter is first reported when it is
// first added to, and a query for its increase cannot see that first value,
// so one that starts at zero has every increase counted.
func (s *Set) Started(ctx context.Context, part Part) {
	if s == nil {
		return
	}
	if part == Server {
		for _, c := range []Counter{s.buildResumes, s.recordsWritten, s.recordsRefused} {
			c.Add(ctx, 0)
		}
		return
	}
	s.versionEvictions.Add(ctx, 0)
	for _, reason := range []HandbackReason{HandbackNoRoom, HandbackConcurrency} {
		s.handbacks.Add(ctx, 0, string(reason))
	}
	for _, reason := range []EvictionReason{EvictedForMemory, EvictedForIdle, EvictedForVersion} {
		s.warmEvictions.Add(ctx, 0, string(reason))
	}
	for _, status := range []string{statusReady, statusFailed} {
		s.hostBuilds.Add(ctx, 0, status)
		s.hostCompiles.Add(ctx, 0, status)
	}
}

// InvocationEnded counts an invocation that ended on a host, with the
// function error of the host's reply when it has one. Each invocation is
// counted once: here, or by InvocationUnserved when no host took it.
func (s *Set) InvocationEnded(ctx context.Context, rec *functionsv1.Invocation, fe *functionsv1.FunctionError) {
	if s == nil {
		return
	}
	function, outcome, kind := rec.GetFunctionId(), invocationStatus(rec.GetStatus()), startKind(rec.GetStartKind())

	s.invocations.Add(ctx, 1, function, outcome, mode(rec.GetAsync()), kind)
	if fe != nil {
		s.failures.Add(ctx, 1, function, token(fe.GetKind().String(), "FUNCTION_ERROR_KIND_"))
	}
	s.inputSize.Add(ctx, float64(rec.GetInputBytes()), function)
	s.outputSize.Add(ctx, float64(rec.GetOutputBytes()), function)
	// Only an invocation that got a microVM has phases to time.
	if rec.GetStartedAt() == 0 {
		return
	}
	s.acquireDuration.Observe(ctx, micros(rec.GetStats().GetAcquireUs()), function, kind)
	s.runDuration.Observe(ctx, micros(rec.GetStats().GetRunUs()), function, outcome)
}

// InvocationUnserved counts an invocation that ended before any host took it.
func (s *Set) InvocationUnserved(ctx context.Context, inv *functionsv1.Invocation) {
	if s == nil {
		return
	}
	s.invocations.Add(ctx, 1, inv.GetFunctionId(), invocationStatus(inv.GetStatus()), mode(inv.GetAsync()), startKind(inv.GetStartKind()))
}

// InvocationAdmitted records how long an invocation waited, from when it was
// accepted, for a host with room to start it.
func (s *Set) InvocationAdmitted(ctx context.Context, waited time.Duration) {
	if s != nil {
		s.queueDuration.Observe(ctx, max(waited, 0).Seconds())
	}
}

// InvocationRetried counts a failed attempt of a function's invocation that
// runs again.
func (s *Set) InvocationRetried(ctx context.Context, functionID string) {
	if s != nil {
		s.retries.Add(ctx, 1, functionID)
	}
}

// InvocationHandedBack counts an invocation a host gave back to the queue
// without running it.
func (s *Set) InvocationHandedBack(ctx context.Context, reason HandbackReason) {
	if s != nil {
		s.handbacks.Add(ctx, 1, string(reason))
	}
}

// CallEnded records how long a synchronous call's caller waited and how it
// ended.
func (s *Set) CallEnded(ctx context.Context, inv *functionsv1.Invocation, took time.Duration) {
	if s != nil {
		s.callDuration.Observe(ctx, took.Seconds(), inv.GetFunctionId(), invocationStatus(inv.GetStatus()))
	}
}

// CallReplayed counts a call answered with an earlier invocation's result by
// idempotency key.
func (s *Set) CallReplayed(ctx context.Context, functionID string) {
	if s != nil {
		s.replays.Add(ctx, 1, functionID)
	}
}

// FunctionBuild is a function version build whose outcome a server wrote.
type FunctionBuild struct {
	Function string
	// Status is the version's status, "ready" or "failed".
	Status  string
	Runtime string
	// Failure is why the build failed, and is recorded as its error type only
	// when it did.
	Failure BuildFailure
	Took    time.Duration
}

// FunctionBuilt records a function version build whose outcome this server
// wrote.
func (s *Set) FunctionBuilt(ctx context.Context, b FunctionBuild) {
	if s == nil {
		return
	}
	var errorType string
	if b.Status == statusFailed {
		errorType = string(b.Failure)
		s.buildFailedAt.Set(ctx, float64(time.Now().Unix()), b.Function)
	}
	s.builds.Add(ctx, 1, b.Function, b.Status, b.Runtime, errorType)
	s.buildDuration.Observe(ctx, b.Took.Seconds(), b.Status, b.Runtime)
}

// BuildResumed counts a build taken over from a server that left it.
func (s *Set) BuildResumed(ctx context.Context) {
	if s != nil {
		s.buildResumes.Add(ctx, 1)
	}
}

// RecordsStored counts invocation records written to the database.
func (s *Set) RecordsStored(ctx context.Context, count int) {
	if s != nil {
		s.recordsWritten.Add(ctx, float64(count))
	}
}

// RecordRefused counts an invocation record the database refused, which is
// dropped.
func (s *Set) RecordRefused(ctx context.Context) {
	if s != nil {
		s.recordsRefused.Add(ctx, 1)
	}
}

// ArtifactBuilt records an artifact build on a host.
func (s *Set) ArtifactBuilt(ctx context.Context, failed bool, took time.Duration) {
	if s == nil {
		return
	}
	status := buildStatus(failed)
	s.hostBuilds.Add(ctx, 1, status)
	s.hostBuildDuration.Observe(ctx, took.Seconds(), status)
}

// SourceCompiled counts a source compile on a host.
func (s *Set) SourceCompiled(ctx context.Context, failed bool) {
	if s != nil {
		s.hostCompiles.Add(ctx, 1, buildStatus(failed))
	}
}

// InstanceStarted counts a microVM booted or restored.
func (s *Set) InstanceStarted(ctx context.Context, kind functionsv1.StartKind, purpose Purpose) {
	if s != nil {
		s.instanceStarts.Add(ctx, 1, startKind(kind), string(purpose))
	}
}

// WarmEvicted counts warm microVMs released.
func (s *Set) WarmEvicted(ctx context.Context, reason EvictionReason, count int) {
	if s == nil || count == 0 {
		return
	}
	s.warmEvictions.Add(ctx, float64(count), string(reason))
}

// VersionEvicted counts a function version a host stopped serving.
func (s *Set) VersionEvicted(ctx context.Context) {
	if s != nil {
		s.versionEvictions.Add(ctx, 1)
	}
}

// WatchQueue reports the invoke queue's depth, as depth reads it, each time
// metrics are collected. A depth that cannot be read is skipped until it can.
func (s *Set) WatchQueue(depth func(context.Context) (waiting, running int, err error)) error {
	if s == nil {
		return nil
	}
	return s.b.Observe(func(ctx context.Context, o Observer) {
		ctx, cancel := context.WithTimeout(ctx, queueDepthTimeout)
		defer cancel()
		w, r, err := depth(ctx)
		if err != nil {
			return
		}
		o.Set(queueWaiting, float64(w))
		o.Set(queueRunning, float64(r))
	}, queueWaiting, queueRunning)
}

// HostState is what a host holds when metrics are collected.
type HostState struct {
	Slots, SlotsInUse                       int
	MemoryBudgetBytes, MemoryCommittedBytes int64
	RootfsCacheBytes                        int64
	RootfsCacheImages                       int
	FirecrackerVersion, Kernel              string
	// Artifacts is how many function versions the host serves.
	Artifacts int
	// Instances is the host's microVMs by state, every state included.
	Instances map[functionsv1.InstanceStatus]int64
	// Running is the invocations running on the host by function id.
	Running map[string]int
}

// WatchHost reports what a host holds, as read returns it, each time metrics
// are collected.
func (s *Set) WatchHost(read func() HostState) error {
	if s == nil {
		return nil
	}
	return s.b.Observe(func(_ context.Context, o Observer) {
		h := read()
		o.Set(slots, float64(h.Slots))
		o.Set(busySlots, float64(h.SlotsInUse))
		o.Set(memoryBudget, float64(h.MemoryBudgetBytes))
		o.Set(memoryCommitted, float64(h.MemoryCommittedBytes))
		o.Set(cacheSize, float64(h.RootfsCacheBytes))
		o.Set(cacheImages, float64(h.RootfsCacheImages))
		// A host that cannot name its Firecracker, as one shutting down cannot, reports no info.
		if h.FirecrackerVersion != "" {
			o.Set(hostInfo, 1, h.FirecrackerVersion, h.Kernel)
		}
		o.Set(artifacts, float64(h.Artifacts))
		for state, count := range h.Instances {
			o.Set(instances, float64(count), token(state.String(), "INSTANCE_STATUS_"))
		}
		for function, count := range h.Running {
			o.Set(running, float64(count), function)
		}
	}, running, slots, busySlots, memoryBudget, memoryCommitted, instances, artifacts, cacheSize, cacheImages, hostInfo)
}

func invocationStatus(s functionsv1.InvocationStatus) string {
	return token(s.String(), "INVOCATION_STATUS_")
}

func mode(async bool) string {
	if async {
		return modeAsync
	}
	return modeSync
}

func startKind(k functionsv1.StartKind) string {
	if k == functionsv1.StartKind_START_KIND_UNSPECIFIED {
		return startKindNone
	}
	return token(k.String(), "START_KIND_")
}

func buildStatus(failed bool) string {
	if failed {
		return statusFailed
	}
	return statusReady
}

func token(name, prefix string) string {
	return strings.ToLower(strings.TrimPrefix(name, prefix))
}

func micros(us int64) float64 {
	return (time.Duration(us) * time.Microsecond).Seconds()
}
