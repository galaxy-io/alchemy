package server

import (
	"context"
	"time"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
)

const (
	// reconcileInterval is how often the server compares what hosts serve with
	// the current version of every function.
	reconcileInterval = 5 * time.Second
	// reconcileRetry is how long a build sent to one host for one artifact
	// stands before it is sent again: long enough for a slow build to finish
	// and for a failing one not to be retried in a loop.
	reconcileRetry = time.Minute
)

// reconcileHosts keeps every live host serving the current version of every
// function. A build only reaches the hosts alive when it runs, so without
// this a host that starts later, or restarts, never takes those functions'
// invocations while another host still does.
func (s *Service) reconcileHosts() {
	ticker := time.NewTicker(reconcileInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.background.Done():
			return
		case <-ticker.C:
			s.reconcileOnce()
		}
	}
}

func (s *Service) reconcileOnce() {
	hosts := s.hostArtifacts()
	if len(hosts) == 0 {
		return
	}
	rows, err := s.store.ListCurrentFunctionVersions(s.background)
	if err != nil {
		s.log.Warn("reconcile: list current versions", "err", err)
		return
	}
	now := time.Now()
	s.mu.Lock()
	for key, sent := range s.hostBuilds {
		if now.Sub(sent) > reconcileRetry {
			delete(s.hostBuilds, key)
		}
	}
	s.mu.Unlock()
	for _, row := range rows {
		if row.ArtifactID == "" {
			continue
		}
		cv, err := s.compiled(row)
		if err != nil {
			s.log.Warn("reconcile: compile version", "function_id", row.FunctionID, "version", row.Version, "err", err)
			continue
		}
		for name, served := range hosts {
			if served[row.ArtifactID] {
				continue
			}
			key := name + "/" + row.ArtifactID
			s.mu.Lock()
			_, sent := s.hostBuilds[key]
			if !sent {
				s.hostBuilds[key] = now
			}
			s.mu.Unlock()
			if !sent {
				s.tasks.Go(func() { s.buildOn(name, cv) })
			}
		}
	}
}

// buildOn asks host name alone to build cv. Hosts cache by image and layer
// digests, so a host that has built the version before only resolves it.
func (s *Service) buildOn(name string, cv *compiledVersion) {
	ctx, cancel := context.WithTimeout(s.background, s.cfg.BuildTimeout)
	defer cancel()
	log := s.log.With("host", name, "function_id", cv.row.FunctionID, "version", cv.row.Version, "artifact_id", cv.row.ArtifactID)
	start := time.Now()
	resp := &hostv1.BuildResponse{}
	if err := s.bus.Request(ctx, bus.HostBuildSubject(name), &hostv1.BuildRequest{TenantId: cv.row.TenantID, Spec: cv.pinnedSpec(), Layers: cv.artifact.GetLayers()}, resp); err != nil {
		log.Warn("reconcile: build", "err", err)
		return
	}
	switch {
	case resp.GetError() != nil:
		log.Warn("reconcile: build", "err", resp.GetError().GetMessage())
	case resp.GetArtifact().GetId() != cv.row.ArtifactID:
		// The host serves the artifact it built, which is not the one the
		// version invokes, so it still takes none of its invocations.
		log.Warn("reconcile: host built a different artifact", "built_artifact_id", resp.GetArtifact().GetId())
	default:
		log.Info("host reconciled", "took", time.Since(start).Round(time.Millisecond))
	}
}

// hostArtifacts returns what every live host serves, by host name.
func (s *Service) hostArtifacts() map[string]map[string]bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]map[string]bool, len(s.hosts))
	for name, k := range s.hosts {
		if time.Since(k.seen) <= s.cfg.HostTTL {
			out[name] = k.artifacts
		}
	}
	return out
}
