package host

import (
	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/telemetry"
)

const bytesPerMiB = 1 << 20

func (h *Host) state() telemetry.HostState {
	host := h.describe()
	served, states := h.holding()
	running := map[string]int{}
	for _, fn := range h.runningByFunction() {
		running[fn.GetFunctionId()] = int(fn.GetCount())
	}
	return telemetry.HostState{
		Slots:                int(host.GetSlots()),
		SlotsInUse:           int(host.GetSlotsInUse()),
		MemoryBudgetBytes:    h.cfg.MemoryMiB * bytesPerMiB,
		MemoryCommittedBytes: host.GetMemoryMibCommitted() * bytesPerMiB,
		RootfsCacheBytes:     host.GetRootfsCacheBytes(),
		RootfsCacheImages:    int(host.GetRootfsCacheImages()),
		FirecrackerVersion:   host.GetFirecrackerVersion(),
		Kernel:               host.GetKernel(),
		Artifacts:            served,
		Instances:            states,
		Running:              running,
	}
}

// holding is how many artifacts the host serves and its instances by state, every state included.
func (h *Host) holding() (int, map[functionsv1.InstanceStatus]int64) {
	states := map[functionsv1.InstanceStatus]int64{
		functionsv1.InstanceStatus_INSTANCE_STATUS_BOOTING:   0,
		functionsv1.InstanceStatus_INSTANCE_STATUS_READY:     0,
		functionsv1.InstanceStatus_INSTANCE_STATUS_BUSY:      0,
		functionsv1.InstanceStatus_INSTANCE_STATUS_RELEASING: 0,
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, live := range h.instances {
		states[live.statusNow()]++
	}
	return len(h.artifacts), states
}
