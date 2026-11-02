//go:build !linux

package supervisor

// resume only matters inside a microVM, which is Linux.
func resume(int64) {}
