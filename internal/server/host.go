package server

import (
	"context"
	"sort"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
)

// knownHost is what a host last said about itself.
type knownHost struct {
	host      *functionsv1.Host
	artifacts map[string]bool // ids the host is taking invocations for
	seen      time.Time
}

// listen subscribes to what hosts publish: heartbeats, and the progress
// of invocations the server has handed them.
func (s *Service) listen() error {
	hb, err := s.bus.Subscribe(s.background, bus.HeartbeatWildcard, "", s.onHeartbeat)
	if err != nil {
		return err
	}
	st, err := s.bus.Subscribe(s.background, bus.InvocationStateWildcard, "", s.onInvocationState)
	if err != nil {
		hb.Unsubscribe()
		return err
	}
	s.subs = append(s.subs, hb, st)
	return nil
}

func (s *Service) onHeartbeat(_ context.Context, data []byte) proto.Message {
	msg := &hostv1.Heartbeat{}
	if err := proto.Unmarshal(data, msg); err != nil || msg.GetHost() == nil {
		return nil
	}
	artifacts := make(map[string]bool, len(msg.GetArtifactIds()))
	for _, id := range msg.GetArtifactIds() {
		artifacts[id] = true
	}
	s.mu.Lock()
	s.hosts[msg.GetHost().GetHostname()] = &knownHost{host: msg.GetHost(), artifacts: artifacts, seen: time.Now()}
	s.mu.Unlock()
	return nil
}

// onInvocationState records STARTING and RUNNING as a host reports them;
// the terminal state comes with the invoke reply.
func (s *Service) onInvocationState(_ context.Context, data []byte) proto.Message {
	ev := &hostv1.InvocationEvent{}
	if err := proto.Unmarshal(data, ev); err != nil {
		return nil
	}
	ctx := s.background
	var row *sqlcgen.Invocation
	var err error
	switch ev.GetStatus() {
	case functionsv1.InvocationStatus_INVOCATION_STATUS_STARTING:
		row, err = s.store.SetInvocationStarting(ctx, ev.GetInvocationId())
	case functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING:
		row, err = s.store.SetInvocationRunning(ctx, sqlcgen.SetInvocationRunningParams{
			ID:         ev.GetInvocationId(),
			StartKind:  startKindRow(ev.GetStartKind()),
			InstanceID: ev.GetInstanceId(),
			AcquireUs:  ev.GetAcquireUs(),
		})
	default:
		return nil
	}
	if err != nil {
		s.log.Warn("record invocation state", "invocation", ev.GetInvocationId(), "status", ev.GetStatus(), "err", err)
		return nil
	}
	s.events.publish(invocationProto(row))
	return nil
}

// liveHosts returns hosts heard from within HostTTL, by name.
func (s *Service) liveHosts() []*functionsv1.Host {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []*functionsv1.Host
	for name, k := range s.hosts {
		if time.Since(k.seen) > s.cfg.HostTTL {
			delete(s.hosts, name)
			continue
		}
		out = append(out, k.host)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].GetHostname() < out[j].GetHostname() })
	return out
}

// ListInstances asks every host what it is running and names the function
// and version behind each artifact.
func (s *Service) ListInstances(ctx context.Context, req *connect.Request[functionsv1.ListInstancesRequest]) (*connect.Response[functionsv1.ListInstancesResponse], error) {
	replies, err := s.bus.Gather(ctx, bus.InstancesSubject, &hostv1.ListInstancesRequest{}, s.cfg.GatherWindow,
		func() proto.Message { return &hostv1.ListInstancesResponse{} })
	if err != nil {
		return nil, connect.NewError(connect.CodeUnavailable, err)
	}
	resp := &functionsv1.ListInstancesResponse{}
	versions := map[string]*sqlcgen.FunctionVersion{}
	for _, r := range replies {
		for _, in := range r.(*hostv1.ListInstancesResponse).GetInstances() {
			v, ok := versions[in.GetArtifactId()]
			if !ok {
				row, err := s.store.GetFunctionVersionByArtifact(ctx, sqlcgen.GetFunctionVersionByArtifactParams{TenantID: s.tenant, ArtifactID: in.GetArtifactId()})
				if err == nil {
					v = row
				}
				versions[in.GetArtifactId()] = v
			}
			if v == nil {
				continue // another tenant's, or an artifact this server never built
			}
			in.FunctionId, in.Version = v.FunctionID, v.Version
			if req.Msg.GetFunctionId() != "" && in.GetFunctionId() != req.Msg.GetFunctionId() {
				continue
			}
			resp.Instances = append(resp.Instances, in)
		}
	}
	sort.Slice(resp.Instances, func(i, j int) bool { return resp.Instances[i].GetStartedAt() < resp.Instances[j].GetStartedAt() })
	return connect.NewResponse(resp), nil
}

// ListHosts returns every live host, by hostname.
func (s *Service) ListHosts(context.Context, *connect.Request[functionsv1.ListHostsRequest]) (*connect.Response[functionsv1.ListHostsResponse], error) {
	return connect.NewResponse(&functionsv1.ListHostsResponse{Hosts: s.liveHosts()}), nil
}

// GetHost returns the first live host by hostname. ListHosts supersedes it
// now that there can be several.
func (s *Service) GetHost(context.Context, *connect.Request[functionsv1.GetHostRequest]) (*connect.Response[functionsv1.GetHostResponse], error) {
	hosts := s.liveHosts()
	if len(hosts) == 0 {
		return nil, connect.NewError(connect.CodeUnavailable, errNoHosts)
	}
	return connect.NewResponse(&functionsv1.GetHostResponse{Host: hosts[0]}), nil
}
