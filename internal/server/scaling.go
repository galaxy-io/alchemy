package server

import (
	"time"
)

// Scaling is the demand hosts are scaled on. KEDA's metrics-api scaler
// reads it from GET /scaling and sizes the host Deployment as Demand
// divided by the slots each host should keep busy.
type Scaling struct {
	// Hosts heartbeating now, and the slots they have between them.
	Hosts int `json:"hosts"`
	Slots int `json:"slots"`
	// SlotsInUse is what hosts last reported as busy.
	SlotsInUse int `json:"slotsInUse"`
	// Waiting is invocations held because every host serving their
	// artifact is full. They are demand no host has room for yet.
	Waiting int `json:"waiting"`
	// Demand is SlotsInUse plus Waiting: the slots wanted right now.
	Demand int `json:"demand"`
}

// Scaling sums live hosts' last heartbeats and the invocations waiting for
// a slot.
func (s *Service) Scaling() Scaling {
	var out Scaling
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
	out.Waiting = int(s.waiting.Load())
	out.Demand = out.SlotsInUse + out.Waiting
	return out
}
