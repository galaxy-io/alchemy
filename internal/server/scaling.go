package server

import (
	"context"
	"time"
)

// Scaling is the demand hosts are scaled on. KEDA's metrics-api scaler
// reads it from GET /scaling and sizes the host Deployment as Demand
// divided by the slots each host should keep busy. Every server gives the
// same answer: the queue's depth is read from NATS.
type Scaling struct {
	// Hosts heartbeating now, and the slots they have between them.
	Hosts int `json:"hosts"`
	Slots int `json:"slots"`
	// SlotsInUse is what hosts last reported as busy.
	SlotsInUse int `json:"slotsInUse"`
	// Waiting is invocations queued that no host has taken.
	Waiting int `json:"waiting"`
	// Demand is the invocations queued and the ones hosts hold: the slots
	// wanted right now.
	Demand int `json:"demand"`
}

// Scaling reads the queue's depth and sums live hosts' last heartbeats.
func (s *Service) Scaling(ctx context.Context) (Scaling, error) {
	waiting, running, err := s.queue.Depth(ctx)
	if err != nil {
		return Scaling{}, err
	}
	out := Scaling{Waiting: waiting, Demand: waiting + running}
	s.mu.Lock()
	for _, k := range s.hosts {
		if time.Since(k.seen) > s.cfg.HostTTL {
			continue
		}
		out.Hosts++
		out.Slots += int(k.host.GetSlots())
		out.SlotsInUse += int(k.host.GetSlotsInUse())
	}
	s.mu.Unlock()
	return out, nil
}
