package server

import (
	"context"
	"sort"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/api/host/v1/hostv1connect"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
	"github.com/galaxy-io/alchemy/internal/bus"
)

// knownHost is what a host last said about itself.
type knownHost struct {
	host      *functionsv1.Host
	artifacts map[string]*hostv1.ArtifactState // what it holds, by artifact id
	invokeURL string                           // where it serves HostService
	invoke    hostv1connect.HostServiceClient  // dials invokeURL
	seen      time.Time
}

// knownServer is what another server last said about itself.
type knownServer struct {
	pending int32
	seen    time.Time
}

// serverHeartbeatInterval is how often a server announces itself.
const serverHeartbeatInterval = 2 * time.Second

// listen subscribes to what hosts and other servers publish: every host's
// and server's heartbeats, the progress hosts report on this server's
// invocations, and other servers' requests for the invocations it holds.
func (s *Service) listen() error {
	subs := []struct {
		subject string
		handler bus.Handler
		serve   bool
	}{
		{bus.HeartbeatWildcard, s.onHeartbeat, false},
		{bus.ServerHeartbeatWildcard, s.onServerHeartbeat, false},
		{bus.ServerStateSubject(s.cfg.Name), s.onInvocationState, false},
		{bus.ServerInvocationsSubject, s.handleActiveInvocations, true},
		{bus.ServerSecretsSubject, s.handleSecrets, true},
	}
	for _, sb := range subs {
		var sub *bus.Subscription
		var err error
		if sb.serve {
			sub, err = s.bus.Serve(s.background, sb.subject, "", sb.handler)
		} else {
			sub, err = s.bus.Subscribe(s.background, sb.subject, "", sb.handler)
		}
		if err != nil {
			for _, sub := range s.subs {
				sub.Unsubscribe()
			}
			s.subs = nil
			return err
		}
		s.subs = append(s.subs, sub)
	}
	return nil
}

// heartbeat announces this server until the service stops, and lets go of
// invocations that ended a while ago.
func (s *Service) heartbeat() {
	ticker := time.NewTicker(serverHeartbeatInterval)
	defer ticker.Stop()
	for {
		s.tracker.forget(time.Now())
		hb := &hostv1.ServerHeartbeat{Name: s.cfg.Name, Pending: int32(s.tracker.pending())} //nolint:gosec // small
		if err := s.bus.Publish(bus.ServerHeartbeatSubject(s.cfg.Name), hb); err != nil {
			s.log.Warn("heartbeat", "err", err)
		}
		select {
		case <-s.background.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Service) onServerHeartbeat(_ context.Context, data []byte) proto.Message {
	msg := &hostv1.ServerHeartbeat{}
	if err := proto.Unmarshal(data, msg); err != nil || msg.GetName() == "" {
		return nil
	}
	s.mu.Lock()
	s.servers[msg.GetName()] = &knownServer{pending: msg.GetPending(), seen: time.Now()}
	s.mu.Unlock()
	return nil
}

// liveServers returns the other servers heard from within HostTTL.
func (s *Service) liveServers() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []string
	for name, k := range s.servers {
		if time.Since(k.seen) > s.cfg.HostTTL {
			delete(s.servers, name)
			continue
		}
		if name != s.cfg.Name {
			out = append(out, name)
		}
	}
	return out
}

func (s *Service) onHeartbeat(_ context.Context, data []byte) proto.Message {
	msg := &hostv1.Heartbeat{}
	if err := proto.Unmarshal(data, msg); err != nil || msg.GetHost() == nil {
		return nil
	}
	artifacts := make(map[string]*hostv1.ArtifactState, len(msg.GetArtifacts()))
	for _, st := range msg.GetArtifacts() {
		artifacts[st.GetId()] = st
	}
	name, url := msg.GetHost().GetHostname(), msg.GetInvokeUrl()
	s.mu.Lock()
	defer s.mu.Unlock()
	// A host keeps its client, and so its connection, while its URL holds.
	var client hostv1connect.HostServiceClient
	if prev, ok := s.hosts[name]; ok && prev.invokeURL == url {
		client = prev.invoke
	} else {
		client = s.hostClient(url)
	}
	s.hosts[name] = &knownHost{host: msg.GetHost(), artifacts: artifacts, invokeURL: url, invoke: client, seen: time.Now()}
	return nil
}

// onInvocationState moves one of this server's invocations to STARTING or
// RUNNING as the host reports it, for the live streams; the terminal state
// comes with the invoke reply. A report for an invocation that has already
// ended is dropped.
func (s *Service) onInvocationState(_ context.Context, data []byte) proto.Message {
	ev := &hostv1.InvocationEvent{}
	if err := proto.Unmarshal(data, ev); err != nil {
		return nil
	}
	inv := s.tracker.update(ev.GetInvocationId(), func(inv *functionsv1.Invocation) {
		if terminal(inv.GetStatus()) {
			return
		}
		switch ev.GetStatus() {
		case functionsv1.InvocationStatus_INVOCATION_STATUS_STARTING:
			if inv.GetStatus() == functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING {
				inv.Status = ev.GetStatus()
			}
		case functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING:
			inv.Status = ev.GetStatus()
			inv.StartKind = ev.GetStartKind()
			inv.InstanceId = ev.GetInstanceId()
			inv.StartedAt = time.Now().UnixMilli()
			inv.Stats = &functionsv1.InvocationStats{StartKind: ev.GetStartKind(), AcquireUs: ev.GetAcquireUs()}
		}
	})
	if inv != nil {
		s.publishInvocation(inv)
	}
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
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return nil, err
	}
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
				row, err := s.store.GetFunctionVersionByArtifact(ctx, sqlcgen.GetFunctionVersionByArtifactParams{TenantID: tenant, ArtifactID: in.GetArtifactId()})
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
