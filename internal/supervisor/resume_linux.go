package supervisor

import (
	"encoding/binary"
	"errors"
	"os"
	"time"
	"unsafe"

	"golang.org/x/sys/unix"
)

// resume brings a guest that may have just been restored from a snapshot
// back in step with the host, as init only: the wall clock is set from the
// host's when the two disagree by more than a second, and the kernel's
// random generator is reseeded, since every instance restored from one
// snapshot wakes with the same generator state. Neither is worth failing an
// invocation over.
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
	reseed()
}

// reseed credits fresh bytes from the virtio-rng device to the kernel's
// pool and makes the generator reseed from it at once. Writing to
// /dev/urandom would only mix the bytes in, and instances restored from one
// snapshot would hand out the same random bytes until the next scheduled
// reseed.
func reseed() {
	seed := make([]byte, 64)
	hwrng, err := os.Open("/dev/hwrng")
	if err != nil {
		return
	}
	n, _ := hwrng.Read(seed)
	_ = hwrng.Close()
	if n == 0 {
		return
	}
	random, err := os.OpenFile("/dev/urandom", os.O_WRONLY, 0)
	if err != nil {
		return
	}
	defer func() { _ = random.Close() }()
	// struct rand_pool_info: entropy_count in bits, buf_size in bytes, buf.
	info := make([]byte, 8+n)
	binary.NativeEndian.PutUint32(info[0:], uint32(n*8)) //nolint:gosec // n <= 64
	binary.NativeEndian.PutUint32(info[4:], uint32(n))   //nolint:gosec // n <= 64
	copy(info[8:], seed[:n])
	fd := random.Fd()
	_, _, _ = unix.Syscall(unix.SYS_IOCTL, fd, unix.RNDADDENTROPY, uintptr(unsafe.Pointer(&info[0]))) //nolint:gosec // the ioctl reads info, which outlives the call
	_, _, _ = unix.Syscall(unix.SYS_IOCTL, fd, unix.RNDRESEEDCRNG, 0)
}

// sweep kills every process in the guest but init and reaps them, as init
// only: orphans are init's children, and init must reap them or they stay
// zombies. Invocations run one at a time, so nothing else is waiting on a
// child.
func sweep() {
	if os.Getpid() != 1 {
		return
	}
	_ = unix.Kill(-1, unix.SIGKILL)
	for {
		_, err := unix.Wait4(-1, nil, 0, nil)
		if errors.Is(err, unix.EINTR) {
			continue
		}
		if err != nil {
			return
		}
	}
}
