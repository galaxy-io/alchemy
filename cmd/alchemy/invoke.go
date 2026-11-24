package main

import (
	"bytes"
	"cmp"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/galaxy-io/alchemy/cmd/internal/cli/interactive"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/style"
)

const (
	jsonContentType  = "application/json"
	arrowContentType = "application/vnd.apache.arrow.stream"
	stdinPath        = "-"
)

type invokeFlags struct {
	data, file   string
	version      int64
	async, arrow bool
}

func (a *cliApp) invokeCommand() *cobra.Command {
	var flags invokeFlags
	cmd := &cobra.Command{
		Use:     "invoke [function]",
		Short:   "Run a function with input from --data, --file or stdin",
		Args:    cobra.MaximumNArgs(1),
		PreRunE: a.prepareTarget,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 1 {
				return a.invoke(cmd.Context(), args[0], flags)
			}
			// Bare invoke picks a function interactively, or explains itself.
			if !a.interactive() {
				return errors.New(`function id is required; example: alchemy invoke <function> --data '{"id":"abc"}'`)
			}
			return a.openInteractive(cmd.Context(), interactive.SectionInvoke)
		},
	}
	cmd.Flags().StringVarP(&flags.data, "data", "d", "", "Send `DATA` as the input")
	cmd.Flags().StringVarP(&flags.file, "file", "f", "", "Read the input from `PATH`, or - for stdin")
	cmd.Flags().Int64Var(&flags.version, "version", 0, "Run version `N` instead of the current one")
	cmd.Flags().BoolVar(&flags.async, "async", false, "Queue the call and print its invocation")
	cmd.Flags().BoolVar(&flags.arrow, "arrow", false, "Send the input as an Arrow IPC stream")
	return cmd
}

// invoke calls the plain HTTP route, so the output reaches stdout as is.
func (a *cliApp) invoke(ctx context.Context, function string, flags invokeFlags) error {
	input, err := a.input(flags.data, flags.file)
	if err != nil {
		return err
	}
	res, err := a.postInvoke(ctx, function, flags, input)
	if err != nil {
		return err
	}
	// A cached token the server no longer accepts is minted once more.
	if res.StatusCode == http.StatusUnauthorized && a.tokens != nil {
		_ = res.Body.Close()
		if err := a.tokens.Invalidate(); err != nil {
			return err
		}
		if res, err = a.postInvoke(ctx, function, flags, input); err != nil {
			return err
		}
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(res.Body)
		message := strings.TrimSpace(string(body))
		if res.StatusCode == http.StatusUnauthorized {
			return errUnauthenticated(a.target.Target.Endpoint, cmp.Or(message, res.Status))
		}
		return fmt.Errorf("%s: %s", res.Status, message)
	}
	if _, err := io.Copy(a.stdout, res.Body); err != nil {
		return err
	}
	if !flags.arrow {
		_, err = fmt.Fprintln(a.stdout)
	}
	return err
}

func (a *cliApp) postInvoke(ctx context.Context, function string, flags invokeFlags, input []byte) (*http.Response, error) {
	endpoint := a.target.Target.Endpoint
	target := endpoint + "/functions/" + url.PathEscape(function) + "/invoke"
	if flags.version > 0 {
		target += "?version=" + strconv.FormatInt(flags.version, 10)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, target, bytes.NewReader(input)) //nolint:gosec // the user names the server
	if err != nil {
		return nil, err
	}
	contentType := jsonContentType
	if flags.arrow {
		contentType = arrowContentType
	}
	req.Header.Set("Content-Type", contentType)
	if flags.async {
		req.Header.Set("Prefer", "respond-async")
	}
	if err := a.authorize(ctx, req.Header); err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req) //nolint:gosec // the user names the server
	if err != nil {
		return nil, errUnreachable(endpoint, err.Error())
	}
	return res, nil
}

// input reads the invoke body: --data, then --file, then piped stdin.
func (a *cliApp) input(data, file string) ([]byte, error) {
	_, typed := style.Terminal(a.stdin)
	switch {
	case data != "" && file != "":
		return nil, errors.New("pass --data or --file, not both")
	case data != "":
		return []byte(data), nil
	case file != "" && file != stdinPath:
		return os.ReadFile(file) //nolint:gosec // the caller names the file
	case file == "" && typed:
		return nil, errors.New("no input; pass --data, --file, or pipe it on stdin")
	default:
		return io.ReadAll(a.stdin)
	}
}
