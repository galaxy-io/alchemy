package supervisor

import (
	"os"
	"time"

	"golang.org/x/sys/unix"
)

// resume brings a guest that may have just been restored from a snapshot
// back in step with the host, as init only: the wall clock is set from the
// host's when the two disagree by more than a second, and the kernel's
// random pool is mixed with fresh bytes from the virtio-rng device, since
// a restore wakes with the pool the snapshot froze. Neither is worth
// failing an invocation over.
func resume(hostTimeMs int64) {
	if os.Getpid() != 1 {
		return
	}
	if hostTimeMs > 0 {
		host := time.UnixMilli(hostTimeMs)
		if drift := time.Until(host); drift > time.Second || drift < -time.Second {
			_ = unix.ClockSettime(unix.CLOCK_REALTIME, &unix.Timespec{Sec: host.Unix(), Nsec: int64(host.Nanosecond())})
		}
	}
	seed := make([]byte, 64)
	if hwrng, err := os.Open("/dev/hwrng"); err == nil {
		n, _ := hwrng.Read(seed)
		_ = hwrng.Close()
		if urandom, err := os.OpenFile("/dev/urandom", os.O_WRONLY, 0); err == nil {
			_, _ = urandom.Write(seed[:n])
			_ = urandom.Close()
		}
	}
}
