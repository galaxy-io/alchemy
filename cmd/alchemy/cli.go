package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
	cliauth "github.com/galaxy-io/alchemy/cmd/internal/cli/auth"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/contexts"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/interactive"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/settings"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/style"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/text"
)

const (
	layoutEnv  = "ALCHEMY_LAYOUT"
	layoutFlag = "layout"
)

type cliApp struct {
	stdin       io.Reader
	stdout      io.Writer
	stderr      io.Writer
	contextPath string
	contextName string
	layoutName  string
	layout      style.Layout
	menuMode    bool
	target      contexts.NamedTarget
	tokens      *cliauth.Source
	functions   functionsv1connect.FunctionsServiceClient
}

func (a *cliApp) run(ctx context.Context, args []string) error {
	if err := a.printBanner(args); err != nil {
		return err
	}
	root := a.rootCommand()
	root.SetArgs(args)
	return a.describe(root.ExecuteContext(ctx))
}

// prepare resolves the table layout: the flag, then the environment, then the saved setting.
func (a *cliApp) prepare(cmd *cobra.Command, _ []string) error {
	saved, err := settings.Load(a.settingsPath())
	if err != nil {
		return err
	}
	name := saved.Layout
	if value := os.Getenv(layoutEnv); value != "" {
		name = value
	}
	if cmd.Flags().Changed(layoutFlag) {
		name = a.layoutName
	}
	a.layout, err = style.ParseLayout(name)
	return err
}

// saveLayout persists the layout as the user's preference.
func (a *cliApp) saveLayout(layout style.Layout) error {
	saved, err := settings.Load(a.settingsPath())
	if err != nil {
		return err
	}
	saved.Layout = layout.String()
	a.layout = layout
	return settings.Save(a.settingsPath(), saved)
}

func (a *cliApp) interactive() bool {
	return interactive.Available(a.stdin, a.statusWriter())
}

// menu opens section's menu under --interactive on a terminal, and prints help otherwise.
func (a *cliApp) menu(section interactive.Section) func(*cobra.Command, []string) error {
	return func(cmd *cobra.Command, _ []string) error {
		if !a.menuMode || !a.interactive() {
			return cmd.Help()
		}
		return a.openInteractive(cmd.Context(), section)
	}
}

// openInteractive hands the terminal to the menus at section.
func (a *cliApp) openInteractive(ctx context.Context, section interactive.Section) error {
	if err := a.dial(); err != nil {
		return err
	}
	if _, err := fmt.Fprintln(a.statusWriter()); err != nil {
		return err
	}
	return interactive.New(interactive.Options{
		Stdin: a.stdin, Status: a.statusWriter(), Functions: a.functions,
		TargetName: a.target.Name, Layout: a.layout, PageSize: defaultPageSize, SaveLayout: a.saveLayout,
	}).Open(ctx, section)
}

// describe turns an RPC failure into a message that names the server.
func (a *cliApp) describe(err error) error {
	var connectErr *connect.Error
	endpoint := a.target.Target.Endpoint
	if !errors.As(err, &connectErr) || endpoint == "" {
		return err
	}
	switch connectErr.Code() {
	case connect.CodeUnauthenticated:
		return errUnauthenticated(endpoint, connectErr.Message())
	case connect.CodeUnavailable:
		return errUnreachable(endpoint, connectErr.Message())
	default:
		return errors.New(connectErr.Message())
	}
}

func errUnauthenticated(endpoint, detail string) error {
	return fmt.Errorf("%s rejected the request as unauthenticated (%s); run alchemy auth login", endpoint, detail)
}

func errUnreachable(endpoint, detail string) error {
	return fmt.Errorf("cannot reach %s: %s", endpoint, detail)
}

func (a *cliApp) text() text.Renderer {
	return text.New(a.stdout, a.layout)
}

func (a *cliApp) contextRegistry() *contexts.Registry {
	return contexts.NewRegistry(contexts.Store{Path: a.contextPath})
}

func (a *cliApp) credentialStore() cliauth.Store {
	return cliauth.Store{Path: a.credentialsPath()}
}

func (a *cliApp) statusWriter() io.Writer {
	if a.stderr != nil {
		return a.stderr
	}
	return a.stdout
}

func printSuccess(w io.Writer, message string) error {
	_, err := fmt.Fprintln(w, message+".")
	return err
}

// confirm asks a yes/no question. A closed stdin is an error, not a refusal.
func (a *cliApp) confirm(question string) (bool, error) {
	out := a.statusWriter()
	if _, err := fmt.Fprintf(out, "%s [y/N] ", question); err != nil {
		return false, err
	}
	answer, err := bufio.NewReader(a.stdin).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return false, fmt.Errorf("read confirmation: %w", err)
	}
	answer = strings.ToLower(strings.TrimSpace(answer))
	if errors.Is(err, io.EOF) && answer == "" {
		return false, errors.New("confirmation requires input; rerun with --force to bypass")
	}
	if answer == "y" || answer == "yes" {
		return true, nil
	}
	_, err = fmt.Fprintln(out, "Cancelled.")
	return false, err
}
