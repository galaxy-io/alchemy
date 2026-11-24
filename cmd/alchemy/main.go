// Command alchemy inspects and invokes functions on an Alchemy server.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

const exitFailure = 1

func main() {
	os.Exit(runMain())
}

func runMain() int {
	path, err := defaultContextPath()
	if err != nil {
		printCLIError(err)
		return exitFailure
	}
	cli := &cliApp{stdin: os.Stdin, stdout: os.Stdout, stderr: os.Stderr, contextPath: path}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	defer stop()
	// Once cancelled, signals fall back to their defaults, so a second interrupt ends the process.
	go func() {
		<-ctx.Done()
		stop()
	}()
	if err := cli.run(ctx, os.Args[1:]); err != nil {
		// An interrupt needs no explanation.
		if !errors.Is(err, context.Canceled) {
			printCLIError(err)
		}
		return exitFailure
	}
	return 0
}

func printCLIError(err error) {
	_, _ = fmt.Fprintln(os.Stderr, "alchemy:", err)
}
