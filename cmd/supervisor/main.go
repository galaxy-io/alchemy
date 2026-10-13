// Command supervisor runs inside the instance next to the function process and
// serves SupervisorService to the host.
//
// In a Firecracker microVM it is the guest's init: the kernel starts it as
// PID 1 on a read-only root filesystem built from the function's image, it
// mounts what a process expects to find, and it listens on vsock for the
// host.
package main

import (
	"flag"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/galaxy-io/alchemy/api/supervisor/v1/supervisorv1connect"
	"github.com/galaxy-io/alchemy/internal/supervisor"
)

// vsockPort is where the supervisor listens in a microVM. The host connects
// through Firecracker's vsock Unix socket with "CONNECT 1024".
const vsockPort = 1024

func main() {
	listen := flag.String("listen", "", "address to serve on: unix:///path/to.sock or vsock://PORT (default when PID 1: vsock://1024)")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	if os.Getpid() == 1 {
		if err := initGuest(); err != nil {
			log.Error("init guest", "err", err)
			os.Exit(1)
		}
		if *listen == "" {
			*listen = "vsock://" + strconv.Itoa(vsockPort)
		}
	}

	ln, err := listenOn(*listen)
	if err != nil {
		log.Error("listen", "addr", *listen, "err", err)
		os.Exit(2)
	}

	mux := http.NewServeMux()
	mux.Handle(supervisorv1connect.NewSupervisorServiceHandler(&supervisor.Service{Logs: os.Stderr}))

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Info("supervisor listening", "addr", *listen)
	if err := srv.Serve(ln); err != nil {
		log.Error("serve", "err", err)
		os.Exit(1)
	}
}

func listenOn(addr string) (net.Listener, error) {
	switch {
	case strings.HasPrefix(addr, "unix://"):
		return net.Listen("unix", strings.TrimPrefix(addr, "unix://"))
	case strings.HasPrefix(addr, "vsock://"):
		port, err := strconv.ParseUint(strings.TrimPrefix(addr, "vsock://"), 10, 32)
		if err != nil {
			return nil, err
		}
		return listenVsock(uint32(port))
	default:
		return nil, &net.AddrError{Err: "unsupported --listen address", Addr: addr}
	}
}
