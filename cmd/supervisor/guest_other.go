//go:build !linux

package main

import (
	"errors"
	"net"
)

func initGuest() error { return errors.New("init mode is Linux-only") }

func listenVsock(uint32) (net.Listener, error) {
	return nil, errors.New("vsock is Linux-only")
}
