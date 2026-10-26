package server

import (
	"time"
)

const (
	// reconcileInterval is how often the server compares what hosts serve with
	// the current version of every function placed on them.
	reconcileInterval = 5 * time.Second
	// reconcileRetry is how long a build sent to one host for one artifact
	// stands before it is sent again: long enough for a slow build to finish
	// and for a failing one not to be retried in a loop.
	reconcileRetry = time.Minute
)

// reconcileHosts keeps the hosts each function lives on serving its current
// version. A build only reaches the hosts alive when it runs, and placement
// moves as hosts come and go, so without this a host that starts later, or
// restarts, never takes its functions' invocations.
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
		for _, name := range s.placedHosts(row.FunctionID) {
			if hosts[name][row.ArtifactID] {
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

// buildOn builds cv on host name, one of the hosts its function lives on.
func (s *Service) buildOn(name string, cv *compiledVersion) {
	log := s.log.With("host", name, "function_id", cv.row.FunctionID, "version", cv.row.Version, "artifact_id", cv.row.ArtifactID)
	start := time.Now()
	built, err := s.buildOnHost(s.background, name, cv)
	switch {
	case err != nil:
		log.Warn("reconcile: build", "err", err)
	case built.GetId() != cv.row.ArtifactID:
		// The host serves the artifact it built, which is not the one the
		// version invokes, so it still takes none of its invocations.
		log.Warn("reconcile: host built a different artifact", "built_artifact_id", built.GetId())
	default:
		s.noteArtifact(name, cv.row.ArtifactID, "", true)
		log.Info("host reconciled", "took", time.Since(start).Round(time.Millisecond))
	}
}

// hostArtifacts returns the artifact ids every live host serves, by host
// name, copied so the caller reads them without the lock.
func (s *Service) hostArtifacts() map[string]map[string]bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]map[string]bool, len(s.hosts))
	for name, k := range s.hosts {
		if time.Since(k.seen) > s.cfg.HostTTL {
			continue
		}
		ids := make(map[string]bool, len(k.artifacts))
		for id := range k.artifacts {
			ids[id] = true
		}
		out[name] = ids
	}
	return out
}
