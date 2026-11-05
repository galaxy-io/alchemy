package server

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
	"github.com/galaxy-io/alchemy/internal/contract"
)

const maxNameLen = 128

// CreateFunction registers a function and starts building its first version.
func (s *Service) CreateFunction(ctx context.Context, req *connect.Request[functionsv1.CreateFunctionRequest]) (*connect.Response[functionsv1.CreateFunctionResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	name, err := validName(req.Msg.GetName())
	if err != nil {
		return nil, err
	}
	timeout, err := s.validTimeout(req.Msg.GetTimeoutMs())
	if err != nil {
		return nil, err
	}
	limit, err := validConcurrency(req.Msg.GetMaxConcurrency())
	if err != nil {
		return nil, err
	}
	spec, err := s.prepareSpec(ctx, req.Msg.GetSpec())
	if err != nil {
		return nil, err
	}
	fn, err := s.store.CreateFunction(ctx, sqlcgen.CreateFunctionParams{
		TenantID:       tenant,
		Name:           name,
		Description:    req.Msg.GetDescription(),
		TimeoutMs:      timeout,
		MaxConcurrency: limit,
	})
	if err != nil {
		return nil, storeError(err, "a function named %q already exists", name)
	}
	if err := s.storeSecretValues(ctx, fn.ID, spec, req.Msg.GetSecretValues()); err != nil {
		return nil, err
	}
	v, err := s.addVersion(ctx, fn.ID, spec)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&functionsv1.CreateFunctionResponse{
		Function: functionProto(fn, nil, nil),
		Version:  versionProto(v),
	}), nil
}

// UpdateFunction changes a function's name, description, timeout and
// concurrency limit. The last two change only when the request sets them,
// and apply to the next invocation of any version.
func (s *Service) UpdateFunction(ctx context.Context, req *connect.Request[functionsv1.UpdateFunctionRequest]) (*connect.Response[functionsv1.UpdateFunctionResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	name, err := validName(req.Msg.GetName())
	if err != nil {
		return nil, err
	}
	params := sqlcgen.UpdateFunctionParams{
		TenantID:    tenant,
		ID:          req.Msg.GetFunctionId(),
		Name:        name,
		Description: req.Msg.GetDescription(),
	}
	if req.Msg.TimeoutMs != nil {
		timeout, err := s.validTimeout(req.Msg.GetTimeoutMs())
		if err != nil {
			return nil, err
		}
		params.TimeoutMs = pgtype.Int8{Int64: timeout, Valid: true}
	}
	if req.Msg.MaxConcurrency != nil {
		limit, err := validConcurrency(req.Msg.GetMaxConcurrency())
		if err != nil {
			return nil, err
		}
		params.MaxConcurrency = pgtype.Int4{Int32: limit, Valid: true}
	}
	fn, err := s.store.UpdateFunction(ctx, params)
	if err != nil {
		return nil, storeError(err, "a function named %q already exists", name)
	}
	current, _ := s.store.GetCurrentFunctionVersion(ctx, fn.ID)
	return connect.NewResponse(&functionsv1.UpdateFunctionResponse{Function: functionProto(fn, current, nil)}), nil
}

// GetFunction returns one function, with its versions on request.
func (s *Service) GetFunction(ctx context.Context, req *connect.Request[functionsv1.GetFunctionRequest]) (*connect.Response[functionsv1.GetFunctionResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	fn, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: tenant, ID: req.Msg.GetId()})
	if err != nil {
		return nil, notFound(err, "function %q not found", req.Msg.GetId())
	}
	current, _ := s.store.GetCurrentFunctionVersion(ctx, fn.ID)
	var versions []*sqlcgen.FunctionVersion
	if req.Msg.GetIncludeVersions() {
		if versions, err = s.store.ListFunctionVersions(ctx, sqlcgen.ListFunctionVersionsParams{FunctionID: fn.ID, RowLimit: allRows}); err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}
	}
	return connect.NewResponse(&functionsv1.GetFunctionResponse{Function: functionProto(fn, current, versions)}), nil
}

// ListFunctions pages through functions, oldest first, optionally filtered
// by name.
func (s *Service) ListFunctions(ctx context.Context, req *connect.Request[functionsv1.ListFunctionsRequest]) (*connect.Response[functionsv1.ListFunctionsResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	pg, err := pageFor(req.Msg.GetPagination())
	if err != nil {
		return nil, err
	}
	search := strings.TrimSpace(req.Msg.GetSearch())
	rows, err := s.store.ListFunctions(ctx, sqlcgen.ListFunctionsParams{TenantID: tenant, Search: search, RowLimit: pg.limit, RowOffset: pg.offset})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	total, err := s.store.CountFunctions(ctx, sqlcgen.CountFunctionsParams{TenantID: tenant, Search: search})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	resp := &functionsv1.ListFunctionsResponse{Pagination: pg.response(len(rows), total)}
	for _, fn := range rows {
		current, _ := s.store.GetCurrentFunctionVersion(ctx, fn.ID)
		resp.Functions = append(resp.Functions, functionProto(fn, current, nil))
	}
	return connect.NewResponse(resp), nil
}

// DeleteFunction removes a function, its versions and its invocations.
func (s *Service) DeleteFunction(ctx context.Context, req *connect.Request[functionsv1.DeleteFunctionRequest]) (*connect.Response[functionsv1.DeleteFunctionResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	n, err := s.store.DeleteFunction(ctx, sqlcgen.DeleteFunctionParams{TenantID: tenant, ID: req.Msg.GetId()})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	if n == 0 {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("function %q not found", req.Msg.GetId()))
	}
	return connect.NewResponse(&functionsv1.DeleteFunctionResponse{}), nil
}

// CreateFunctionVersion adds an immutable version and starts building it.
func (s *Service) CreateFunctionVersion(ctx context.Context, req *connect.Request[functionsv1.CreateFunctionVersionRequest]) (*connect.Response[functionsv1.CreateFunctionVersionResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	spec, err := s.prepareSpec(ctx, req.Msg.GetSpec())
	if err != nil {
		return nil, err
	}
	if _, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: tenant, ID: req.Msg.GetFunctionId()}); err != nil {
		return nil, notFound(err, "function %q not found", req.Msg.GetFunctionId())
	}
	if err := s.storeSecretValues(ctx, req.Msg.GetFunctionId(), spec, req.Msg.GetSecretValues()); err != nil {
		return nil, err
	}
	v, err := s.addVersion(ctx, req.Msg.GetFunctionId(), spec)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&functionsv1.CreateFunctionVersionResponse{Version: versionProto(v)}), nil
}

// GetFunctionVersion returns one version, including its build status and,
// for a function built from source, the content of its files.
func (s *Service) GetFunctionVersion(ctx context.Context, req *connect.Request[functionsv1.GetFunctionVersionRequest]) (*connect.Response[functionsv1.GetFunctionVersionResponse], error) {
	v, err := s.version(ctx, req.Msg.GetFunctionId(), req.Msg.GetVersion())
	if err != nil {
		return nil, err
	}
	version := versionProto(v)
	if err := s.fillSource(ctx, version.GetSpec()); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&functionsv1.GetFunctionVersionResponse{Version: version}), nil
}

// ListFunctionVersions pages through a function's versions, newest first.
func (s *Service) ListFunctionVersions(ctx context.Context, req *connect.Request[functionsv1.ListFunctionVersionsRequest]) (*connect.Response[functionsv1.ListFunctionVersionsResponse], error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: tenant, ID: req.Msg.GetFunctionId()}); err != nil {
		return nil, notFound(err, "function %q not found", req.Msg.GetFunctionId())
	}
	pg, err := pageFor(req.Msg.GetPagination())
	if err != nil {
		return nil, err
	}
	rows, err := s.store.ListFunctionVersions(ctx, sqlcgen.ListFunctionVersionsParams{FunctionID: req.Msg.GetFunctionId(), RowLimit: pg.limit, RowOffset: pg.offset})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	total, err := s.store.CountFunctionVersions(ctx, req.Msg.GetFunctionId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	resp := &functionsv1.ListFunctionVersionsResponse{Pagination: pg.response(len(rows), total)}
	for _, v := range rows {
		resp.Versions = append(resp.Versions, versionProto(v))
	}
	return connect.NewResponse(resp), nil
}

// version loads one version of a tenant's function.
func (s *Service) version(ctx context.Context, functionID string, n int64) (*sqlcgen.FunctionVersion, error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: tenant, ID: functionID}); err != nil {
		return nil, notFound(err, "function %q not found", functionID)
	}
	v, err := s.store.GetFunctionVersion(ctx, sqlcgen.GetFunctionVersionParams{FunctionID: functionID, Version: n})
	if err != nil {
		return nil, notFound(err, "function %q has no version %d", functionID, n)
	}
	return v, nil
}

// addVersion inserts a BUILDING version and starts its build.
func (s *Service) addVersion(ctx context.Context, functionID string, spec *functionsv1.FunctionSpec) (*sqlcgen.FunctionVersion, error) {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
	raw, err := protojson.Marshal(spec)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	v, err := s.store.CreateFunctionVersion(ctx, sqlcgen.CreateFunctionVersionParams{
		TenantID:   tenant,
		FunctionID: functionID,
		Spec:       raw,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	s.startBuild(v)
	return v, nil
}

// startBuild claims a new version's build and runs it. The claim fails only
// when the version was claimed already.
func (s *Service) startBuild(v *sqlcgen.FunctionVersion) {
	s.tasks.Go(func() {
		claimed, err := s.store.ClaimFunctionVersionBuild(s.background, v.ID)
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				s.log.Error("claim build", "function_id", v.FunctionID, "version", v.Version, "err", err)
			}
			return
		}
		s.build(claimed)
	})
}

// build turns a claimed version's spec into an artifact and records the
// outcome, unless another server has taken the build over since.
func (s *Service) build(v *sqlcgen.FunctionVersion) {
	ctx, cancel := context.WithTimeout(s.background, s.cfg.BuildTimeout)
	defer cancel()
	log := s.log.With("function_id", v.FunctionID, "version", v.Version)

	spec, err := decodeSpec(v.Spec)
	if err == nil {
		_, err = contract.Compile(spec.GetContract())
	}
	var artifact *hostv1.Artifact
	var layers []*hostv1.Layer
	var compileLog, buildLog string
	start := time.Now()
	if err == nil {
		layers, compileLog, err = s.versionLayers(ctx, v, spec)
	}
	if err == nil {
		artifact, buildLog, err = s.requestBuild(ctx, v, spec, layers)
	}
	buildLog = compileLog + buildLog

	// A server stopping mid-build leaves the build to another, rather than
	// failing the version for good.
	if err != nil && s.background.Err() != nil {
		if err := s.store.ReleaseFunctionVersionBuild(context.WithoutCancel(ctx), sqlcgen.ReleaseFunctionVersionBuildParams{ID: v.ID, BuildStartedAt: v.BuildStartedAt}); err != nil {
			log.Warn("release build", "err", err)
		}
		log.Info("server stopping; build left for another server")
		return
	}
	finish := sqlcgen.FinishFunctionVersionBuildParams{ID: v.ID, BuildStartedAt: v.BuildStartedAt, BuildLog: buildLog}
	if err != nil {
		finish.Status = sqlcgen.FunctionVersionStatusFailed
		finish.StatusMessage = err.Error()
		if finish.BuildLog == "" {
			finish.BuildLog = err.Error()
		}
		log.Warn("build failed", "err", err)
	} else {
		finish.Status = sqlcgen.FunctionVersionStatusReady
		finish.ImageDigest = artifact.GetDigest()
		finish.RootfsBytes = artifact.GetRootfsBytes()
		finish.ArtifactID = artifact.GetId()
		finish.Artifact, _ = protojson.Marshal(artifact)
		log.Info("build ready", "artifact_id", artifact.GetId(), "digest", artifact.GetDigest(), "rootfs_bytes", artifact.GetRootfsBytes(), "took", time.Since(start).Round(time.Millisecond))
	}
	row, err := s.store.FinishFunctionVersionBuild(context.WithoutCancel(ctx), finish)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		log.Warn("build was taken over by another server; dropping its result")
		return
	case err != nil:
		log.Error("record build result", "err", err)
		return
	}
	_ = s.store.TouchFunction(context.WithoutCancel(ctx), v.FunctionID)
	if artifact != nil {
		s.mu.Lock()
		s.versions[v.ID] = &compiledVersion{row: row, spec: spec, artifact: artifact}
		s.mu.Unlock()
	}
}

// requestBuild builds spec on the least busy live host, trying the next
// when one is gone, and returns the artifact with its build log. Other
// hosts build the artifact themselves when they first take one of the
// version's invocations. Hosts cache by image and layer digests, so a
// rebuild of a known image is a cache hit.
func (s *Service) requestBuild(ctx context.Context, v *sqlcgen.FunctionVersion, spec *functionsv1.FunctionSpec, layers []*hostv1.Layer) (*hostv1.Artifact, string, error) {
	ctx, cancel := context.WithTimeout(ctx, s.cfg.BuildTimeout)
	defer cancel()
	req := &hostv1.BuildRequest{TenantId: v.TenantID, FunctionId: v.FunctionID, Version: v.Version, Spec: spec, Layers: layers}
	err := errNoHosts
	for _, name := range s.hostsByLoad() {
		resp := &hostv1.BuildResponse{}
		rerr := s.bus.Request(ctx, bus.HostBuildSubject(name), req, resp)
		switch {
		case errors.Is(rerr, bus.ErrNoResponders):
			continue
		case rerr != nil:
			return nil, "", rerr
		case resp.GetArtifact() != nil:
			return resp.GetArtifact(), resp.GetBuildLog(), nil
		case resp.GetError().GetCode() == "unavailable":
			err = errors.New(resp.GetError().GetMessage())
			continue
		}
		return nil, resp.GetBuildLog(), errors.New(resp.GetError().GetMessage())
	}
	return nil, "", err
}

// validTimeout is a function's timeout_ms with the server default filled
// in for zero.
func (s *Service) validTimeout(ms int64) (int64, error) {
	switch timeout := time.Duration(ms) * time.Millisecond; {
	case timeout < 0:
		return 0, connect.NewError(connect.CodeInvalidArgument, errors.New("timeout_ms must not be negative"))
	case timeout == 0:
		return s.cfg.DefaultTimeout.Milliseconds(), nil
	case timeout > s.cfg.MaxTimeout:
		return 0, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("timeout_ms exceeds the maximum of %dms", s.cfg.MaxTimeout.Milliseconds()))
	}
	return ms, nil
}

// validConcurrency is a function's max_concurrency, where 0 means no limit.
func validConcurrency(n int32) (int32, error) {
	if n < 0 {
		return 0, connect.NewError(connect.CodeInvalidArgument, errors.New("max_concurrency must not be negative"))
	}
	return n, nil
}

// prepareSpec validates a spec, fills in server defaults, checks that its
// contract compiles and puts its source, if any, in the artifacts bucket.
// The returned spec is a copy.
func (s *Service) prepareSpec(ctx context.Context, in *functionsv1.FunctionSpec) (*functionsv1.FunctionSpec, error) {
	invalid := func(format string, args ...any) error {
		return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf(format, args...))
	}
	if in == nil {
		return nil, invalid("spec is required")
	}
	spec := proto.Clone(in).(*functionsv1.FunctionSpec)

	if strings.TrimSpace(spec.GetImage()) == "" {
		return nil, invalid("spec.image is required")
	}
	switch spec.GetProtocol() {
	case functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_EXEC:
	case functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_RUNTIME_API:
		return nil, connect.NewError(connect.CodeUnimplemented, errors.New("INVOCATION_PROTOCOL_RUNTIME_API is not implemented yet"))
	default:
		return nil, invalid("spec.protocol is required")
	}
	if _, err := contract.Compile(spec.GetContract()); err != nil {
		return nil, invalid("spec.%w", err)
	}
	if err := s.checkSecrets(ctx, spec); err != nil {
		return nil, err
	}

	if spec.GetResources() == nil {
		spec.Resources = &functionsv1.Resources{}
	}
	if spec.GetResources().GetVcpus() == 0 {
		spec.Resources.Vcpus = s.cfg.DefaultVCPUs
	}
	if spec.GetResources().GetMemoryMib() == 0 {
		spec.Resources.MemoryMib = s.cfg.DefaultMemMiB
	}
	if err := s.takeSource(ctx, spec); err != nil {
		return nil, err
	}
	return spec, nil
}

func validName(name string) (string, error) {
	name = strings.TrimSpace(name)
	switch {
	case name == "":
		return "", connect.NewError(connect.CodeInvalidArgument, errors.New("name is required"))
	case len(name) > maxNameLen:
		return "", connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("name is longer than %d bytes", maxNameLen))
	}
	return name, nil
}

// storeError maps a unique violation onto ALREADY_EXISTS, a missing row
// onto NOT_FOUND, and the rest onto an internal error.
func storeError(err error, conflictFormat string, args ...any) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return connect.NewError(connect.CodeAlreadyExists, fmt.Errorf(conflictFormat, args...))
	}
	return notFound(err, "not found")
}

const (
	// resumeInterval is how often the server looks for builds a server
	// left behind.
	resumeInterval = 5 * time.Second
	// resumeAfter is how long past BuildTimeout a build may go with no
	// result before another server takes it over: long enough for a slow
	// build to finish and for a failing one not to be retried in a loop.
	resumeAfter = time.Minute
)

// resumeBuilds takes over builds whose server died, until the service
// stops. Hosts build a version's artifact themselves the first time they
// take one of its invocations, so nothing else needs building ahead.
func (s *Service) resumeBuilds() {
	ticker := time.NewTicker(resumeInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.background.Done():
			return
		case <-ticker.C:
			s.resumeStaleBuilds()
		}
	}
}

// resumeStaleBuilds claims and runs builds that are past what a build may
// take with no result: their server died, or stopped before they ended.
// Every server sweeps; the claim moves build_started_at, so each build is
// taken by one.
func (s *Service) resumeStaleBuilds() {
	stale := s.cfg.BuildTimeout + resumeAfter
	rows, err := s.store.ClaimStaleFunctionVersionBuilds(s.background, pgtype.Interval{Microseconds: stale.Microseconds(), Valid: true})
	if err != nil {
		s.log.Warn("resume builds: claim stale builds", "err", err)
		return
	}
	for _, v := range rows {
		s.log.Warn("resuming a build its server left behind", "function_id", v.FunctionID, "version", v.Version)
		s.tasks.Go(func() { s.build(v) })
	}
}
