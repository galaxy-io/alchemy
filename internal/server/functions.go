package server

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
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
	name, err := validName(req.Msg.GetName())
	if err != nil {
		return nil, err
	}
	spec, err := s.prepareSpec(req.Msg.GetSpec())
	if err != nil {
		return nil, err
	}
	fn, err := s.store.CreateFunction(ctx, sqlcgen.CreateFunctionParams{
		TenantID:    s.tenant,
		Name:        name,
		Description: req.Msg.GetDescription(),
	})
	if err != nil {
		return nil, storeError(err, "a function named %q already exists", name)
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

// UpdateFunction changes a function's name and description.
func (s *Service) UpdateFunction(ctx context.Context, req *connect.Request[functionsv1.UpdateFunctionRequest]) (*connect.Response[functionsv1.UpdateFunctionResponse], error) {
	name, err := validName(req.Msg.GetName())
	if err != nil {
		return nil, err
	}
	fn, err := s.store.UpdateFunction(ctx, sqlcgen.UpdateFunctionParams{
		TenantID:    s.tenant,
		ID:          req.Msg.GetFunctionId(),
		Name:        name,
		Description: req.Msg.GetDescription(),
	})
	if err != nil {
		return nil, storeError(err, "a function named %q already exists", name)
	}
	current, _ := s.store.GetCurrentFunctionVersion(ctx, fn.ID)
	return connect.NewResponse(&functionsv1.UpdateFunctionResponse{Function: functionProto(fn, current, nil)}), nil
}

// GetFunction returns one function, with its versions on request.
func (s *Service) GetFunction(ctx context.Context, req *connect.Request[functionsv1.GetFunctionRequest]) (*connect.Response[functionsv1.GetFunctionResponse], error) {
	fn, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: s.tenant, ID: req.Msg.GetId()})
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
	pg, err := pageFor(req.Msg.GetPagination())
	if err != nil {
		return nil, err
	}
	search := strings.TrimSpace(req.Msg.GetSearch())
	rows, err := s.store.ListFunctions(ctx, sqlcgen.ListFunctionsParams{TenantID: s.tenant, Search: search, RowLimit: pg.limit, RowOffset: pg.offset})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	total, err := s.store.CountFunctions(ctx, sqlcgen.CountFunctionsParams{TenantID: s.tenant, Search: search})
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
	n, err := s.store.DeleteFunction(ctx, sqlcgen.DeleteFunctionParams{TenantID: s.tenant, ID: req.Msg.GetId()})
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
	spec, err := s.prepareSpec(req.Msg.GetSpec())
	if err != nil {
		return nil, err
	}
	if _, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: s.tenant, ID: req.Msg.GetFunctionId()}); err != nil {
		return nil, notFound(err, "function %q not found", req.Msg.GetFunctionId())
	}
	v, err := s.addVersion(ctx, req.Msg.GetFunctionId(), spec)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&functionsv1.CreateFunctionVersionResponse{Version: versionProto(v)}), nil
}

// GetFunctionVersion returns one version, including its build status.
func (s *Service) GetFunctionVersion(ctx context.Context, req *connect.Request[functionsv1.GetFunctionVersionRequest]) (*connect.Response[functionsv1.GetFunctionVersionResponse], error) {
	v, err := s.version(ctx, req.Msg.GetFunctionId(), req.Msg.GetVersion())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&functionsv1.GetFunctionVersionResponse{Version: versionProto(v)}), nil
}

// ListFunctionVersions pages through a function's versions, newest first.
func (s *Service) ListFunctionVersions(ctx context.Context, req *connect.Request[functionsv1.ListFunctionVersionsRequest]) (*connect.Response[functionsv1.ListFunctionVersionsResponse], error) {
	if _, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: s.tenant, ID: req.Msg.GetFunctionId()}); err != nil {
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
	if _, err := s.store.GetFunction(ctx, sqlcgen.GetFunctionParams{TenantID: s.tenant, ID: functionID}); err != nil {
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
	raw, err := protojson.Marshal(spec)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	v, err := s.store.CreateFunctionVersion(ctx, sqlcgen.CreateFunctionVersionParams{
		TenantID:   s.tenant,
		FunctionID: functionID,
		Spec:       raw,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	s.startBuild(v)
	return v, nil
}

func (s *Service) startBuild(v *sqlcgen.FunctionVersion) {
	s.tasks.Go(func() { s.build(v) })
}

// build turns a version's spec into an artifact and records the outcome.
func (s *Service) build(v *sqlcgen.FunctionVersion) {
	ctx, cancel := context.WithTimeout(s.background, s.cfg.BuildTimeout)
	defer cancel()
	log := s.log.With("function", v.FunctionID, "version", v.Version)

	if err := s.store.StartFunctionVersionBuild(ctx, v.ID); err != nil {
		log.Error("record build start", "err", err)
		return
	}
	spec, err := decodeSpec(v.Spec)
	var c contract.Contract
	if err == nil {
		c, err = contract.Compile(spec.GetContract())
	}
	var artifact *hostv1.Artifact
	var buildLog string
	start := time.Now()
	if err == nil {
		artifact, buildLog, err = s.requestBuildWithLog(ctx, v.TenantID, spec)
	}

	finish := sqlcgen.FinishFunctionVersionBuildParams{ID: v.ID, BuildLog: buildLog}
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
		log.Info("build ready", "artifact", artifact.GetId(), "digest", artifact.GetDigest(), "rootfs_bytes", artifact.GetRootfsBytes(), "took", time.Since(start).Round(time.Millisecond))
	}
	row, err := s.store.FinishFunctionVersionBuild(context.WithoutCancel(ctx), finish)
	if err != nil {
		log.Error("record build result", "err", err)
		return
	}
	_ = s.store.TouchFunction(context.WithoutCancel(ctx), v.FunctionID)
	if artifact != nil {
		s.mu.Lock()
		s.versions[v.ID] = &compiledVersion{row: row, spec: spec, contract: c, artifact: artifact}
		s.mu.Unlock()
	}
}

// requestBuild asks any host to build spec and returns the artifact. Hosts
// cache by image digest, so a rebuild of a known image is a cache hit.
func (s *Service) requestBuild(ctx context.Context, tenantID string, spec *functionsv1.FunctionSpec) (*hostv1.Artifact, error) {
	artifact, _, err := s.requestBuildWithLog(ctx, tenantID, spec)
	return artifact, err
}

func (s *Service) requestBuildWithLog(ctx context.Context, tenantID string, spec *functionsv1.FunctionSpec) (*hostv1.Artifact, string, error) {
	ctx, cancel := context.WithTimeout(ctx, s.cfg.BuildTimeout)
	defer cancel()
	resp := &hostv1.BuildResponse{}
	err := s.bus.Request(ctx, bus.BuildSubject, &hostv1.BuildRequest{TenantId: tenantID, Spec: spec}, resp)
	switch {
	case errors.Is(err, bus.ErrNoResponders):
		return nil, "", errNoHosts
	case err != nil:
		return nil, "", err
	}
	if e := resp.GetError(); e != nil {
		return nil, resp.GetBuildLog(), errors.New(e.GetMessage())
	}
	return resp.GetArtifact(), resp.GetBuildLog(), nil
}

// prepareSpec validates a spec, fills in server defaults and checks that
// its contract compiles. The returned spec is a copy.
func (s *Service) prepareSpec(in *functionsv1.FunctionSpec) (*functionsv1.FunctionSpec, error) {
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

	switch timeout := time.Duration(spec.GetTimeoutMs()) * time.Millisecond; {
	case timeout < 0:
		return nil, invalid("spec.timeout_ms must not be negative")
	case timeout == 0:
		spec.TimeoutMs = s.cfg.DefaultTimeout.Milliseconds()
	case timeout > s.cfg.MaxTimeout:
		return nil, invalid("spec.timeout_ms exceeds the maximum of %dms", s.cfg.MaxTimeout.Milliseconds())
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
