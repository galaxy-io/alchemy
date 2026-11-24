package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	cliauth "github.com/galaxy-io/alchemy/cmd/internal/cli/auth"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/text"
)

const (
	reachTimeout = time.Second
	clockLayout  = "15:04:05"
)

func (a *cliApp) statusCommand() *cobra.Command {
	return &cobra.Command{
		Use:     "status",
		Short:   "Show the current context and its server",
		Args:    cobra.NoArgs,
		PreRunE: a.prepareTarget,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return a.status(cmd.Context())
		},
	}
}

func (a *cliApp) status(ctx context.Context) error {
	endpoint := a.target.Target.Endpoint
	rows := [][2]string{
		{"Context", a.target.Name},
		{"Server", endpoint},
		{"Auth", a.authSummary(a.target.Target.AuthProfile)},
	}
	ctx, cancel := context.WithTimeout(ctx, reachTimeout)
	defer cancel()
	if !answers(ctx, endpoint) {
		return text.Details(a.stdout, append(rows, [2]string{"Reachable", "no"}))
	}
	rows = append(rows, [2]string{"Reachable", "yes"})
	if res, err := a.functions.GetVersion(ctx, connect.NewRequest(&functionsv1.GetVersionRequest{})); err == nil {
		rows = append(rows, [2]string{"Version", res.Msg.GetVersion()})
	}
	return text.Details(a.stdout, rows)
}

// answers reports whether the endpoint returns any HTTP response.
func answers(ctx context.Context, endpoint string) bool {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, http.NoBody)
	if err != nil {
		return false
	}
	response, err := http.DefaultClient.Do(request) //nolint:gosec // the user names the server
	if err != nil {
		return false
	}
	_ = response.Body.Close()
	return true
}

func (a *cliApp) authSummary(profile string) string {
	if profile == "" {
		return "none"
	}
	stored, err := a.credentialStore().Get(profile)
	switch {
	case errors.Is(err, cliauth.ErrProfileNotFound):
		return "profile " + profile + " (missing credentials)"
	case err != nil:
		return "profile " + profile + " (credentials unreadable)"
	}
	return fmt.Sprintf("profile %s (%s)", profile, tokenState(stored.Cache))
}

func tokenState(cache *cliauth.Cache) string {
	switch {
	case cache == nil:
		return "no token"
	case time.Now().Before(cache.ExpiresAt):
		return "token valid until " + cache.ExpiresAt.Local().Format(clockLayout)
	default:
		return "token expired"
	}
}
