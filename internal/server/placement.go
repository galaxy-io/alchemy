package server

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"sort"
	"time"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
)

// Placement. A function lives on HostsPerFunction hosts, chosen by
// rendezvous hashing of its id over the live hosts: every host scores
// hash(function, host) and the top scores win. Every server computes the
// same answer from the same heartbeats, and a host joining or leaving moves
// only the functions whose top scores changed. An invocation goes to the
// placed host holding a warm instance, else the least loaded placed host
// that has the artifact, else the first placed host, which builds it first.

// placedHosts returns the live hosts functionID lives on, best score first.
func (s *Service) placedHosts(functionID string) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.placedLocked(functionID)
}

func (s *Service) placedLocked(functionID string) []string {
	type scored struct {
		name  string
		score uint64
	}
	var hosts []scored
	for name, k := range s.hosts {
		if time.Since(k.seen) > s.cfg.HostTTL {
			continue
		}
		hosts = append(hosts, scored{name, rendezvous(functionID, name)})
	}
	sort.Slice(hosts, func(i, j int) bool {
		if hosts[i].score != hosts[j].score {
			return hosts[i].score > hosts[j].score
		}
		return hosts[i].name < hosts[j].name
	})
	n := min(len(hosts), max(s.cfg.HostsPerFunction, 1))
	out := make([]string, n)
	for i := range n {
		out[i] = hosts[i].name
	}
	return out
}

// rendezvous scores one function/host pair. FNV alone leaves hosts whose
// names differ in their last character with nearly the same score, so the
// sum goes through MurmurHash3's finalizer, where every input bit reaches
// every output bit.
func rendezvous(functionID, host string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(functionID))
	_, _ = h.Write([]byte{0})
	_, _ = h.Write([]byte(host))
	x := h.Sum64()
	x ^= x >> 33
	x *= 0xff51afd7ed558ccd
	x ^= x >> 33
	x *= 0xc4ceb9fe1a85ec53
	x ^= x >> 33
	return x
}

// choice is where an invocation goes.
type choice struct {
	host string
	// built is whether the host has the artifact. When it does not, it
	// builds it before the invocation is sent.
	built bool
}

// chooseHost picks the placed host for cv's artifact, leaving out skip: the
// one with the most idle warm instances, else the one serving it with the
// fewest busy slots, else the first placed host without it. It reports
// false when no placed host is left.
func (s *Service) chooseHost(cv *compiledVersion, skip map[string]bool) (choice, bool) {
	id := cv.artifact.GetId()
	s.mu.Lock()
	defer s.mu.Unlock()
	var best, fallback *choice
	var bestIdle, bestBusy int32
	for _, name := range s.placedLocked(cv.row.FunctionID) {
		if skip[name] {
			continue
		}
		k := s.hosts[name]
		st, has := k.artifacts[id]
		if !has {
			if fallback == nil {
				fallback = &choice{host: name}
			}
			continue
		}
		busy := k.host.GetSlotsInUse()
		if best == nil || st.GetIdle() > bestIdle || (st.GetIdle() == bestIdle && busy < bestBusy) {
			best, bestIdle, bestBusy = &choice{host: name, built: true}, st.GetIdle(), busy
		}
	}
	switch {
	case best != nil:
		return *best, true
	case fallback != nil:
		return *fallback, true
	}
	return choice{}, false
}

// noteArtifact records that host name holds artifact id, with an idle
// instance when instanceID ran one, so the next invocations go there before
// its next heartbeat says so. With has false, the host lost the artifact.
func (s *Service) noteArtifact(name, id, instanceID string, has bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k, ok := s.hosts[name]
	if !ok {
		return
	}
	if !has {
		delete(k.artifacts, id)
		return
	}
	st, ok := k.artifacts[id]
	if !ok {
		st = &hostv1.ArtifactState{Id: id}
		k.artifacts[id] = st
	}
	if instanceID != "" && st.GetIdle() == 0 {
		st.Idle = 1
	}
}

// forgetHost drops a host that stopped answering before its heartbeats
// stopped arriving.
func (s *Service) forgetHost(name string) {
	s.mu.Lock()
	delete(s.hosts, name)
	s.mu.Unlock()
}

// buildOnHost asks host name to build cv and returns the artifact it
// serves. Hosts cache by image and layer digests, so a host that has built
// the version before only resolves it.
func (s *Service) buildOnHost(ctx context.Context, name string, cv *compiledVersion) (*hostv1.Artifact, error) {
	ctx, cancel := context.WithTimeout(ctx, s.cfg.BuildTimeout)
	defer cancel()
	resp := &hostv1.BuildResponse{}
	req := &hostv1.BuildRequest{TenantId: cv.row.TenantID, FunctionId: cv.row.FunctionID, Version: cv.row.Version, Spec: cv.pinnedSpec(), Layers: cv.artifact.GetLayers()}
	if err := s.bus.Request(ctx, bus.HostBuildSubject(name), req, resp); err != nil {
		return nil, err
	}
	if e := resp.GetError(); e != nil {
		return nil, errors.New(e.GetMessage())
	}
	return resp.GetArtifact(), nil
}

// buildFor builds cv's artifact on host name so it can take cv's
// invocations, which happens after every placed host restarts.
func (s *Service) buildFor(ctx context.Context, inv *invocation, cv *compiledVersion, name string) error {
	inv.log.Info("placed host lacks the artifact; building", "host", name)
	built, err := s.buildOnHost(ctx, name, cv)
	if err != nil {
		return fmt.Errorf("version %d can no longer be built from %s: %w; create a new version", cv.row.Version, cv.pinnedSpec().GetImage(), err)
	}
	if built.GetId() != cv.artifact.GetId() {
		return fmt.Errorf("version %d rebuilt as a different artifact (%s); create a new version", cv.row.Version, cv.pinnedSpec().GetImage())
	}
	s.noteArtifact(name, cv.artifact.GetId(), "", true)
	return nil
}
