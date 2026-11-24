package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/spf13/cobra"
	"golang.org/x/term"

	authv1 "github.com/galaxy-io/modules/identity/auth/v1"
	"github.com/galaxy-io/modules/identity/auth/v1/authv1connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
	cliauth "github.com/galaxy-io/alchemy/cmd/internal/cli/auth"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/configfile"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/contexts"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/style"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/text"
)

const (
	verifyPageSize      = 1
	fallbackContextName = "remote"
	firstSuffix         = 2
	loginTimeout        = 30 * time.Second
)

var (
	// unnameable matches runs of characters a context name cannot hold.
	unnameable       = regexp.MustCompile(`[^A-Za-z0-9._-]+`)
	errValueRequired = errors.New("a value is required")
)

func (a *cliApp) authCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "auth",
		Short: "Authenticate with an Alchemy server",
	}
	var server, clientID, clientSecret string
	login := &cobra.Command{
		Use:   "login",
		Short: "Log in with a service account",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return a.authLogin(cmd.Context(), server, clientID, clientSecret)
		},
	}
	login.Flags().StringVar(&server, "server", "", "Alchemy server `URL`")
	login.Flags().StringVar(&clientID, "client-id", "", "Service account client `ID`")
	login.Flags().StringVar(&clientSecret, "client-secret", "", "Service account client `SECRET`")
	_ = login.MarkFlagRequired("server")
	cmd.AddCommand(
		login,
		&cobra.Command{
			Use:   "status",
			Short: "Show the current context's authentication state",
			Args:  cobra.NoArgs,
			RunE: func(*cobra.Command, []string) error {
				return a.authStatus()
			},
		},
		&cobra.Command{
			Use:   "logout",
			Short: "Delete the current context's credentials",
			Args:  cobra.NoArgs,
			RunE: func(*cobra.Command, []string) error {
				return a.authLogout()
			},
		},
	)
	return cmd
}

// authLogin proves the credentials against the server before keeping anything.
func (a *cliApp) authLogin(ctx context.Context, server, clientID, clientSecret string) error {
	server = strings.TrimRight(server, "/")
	if err := contexts.ValidateEndpoint(server); err != nil {
		return fmt.Errorf("--server: %w", err)
	}
	if err := requireAuth(ctx, server); err != nil {
		return err
	}
	if err := contexts.RequireSecure(server); err != nil {
		return err
	}
	clientID, clientSecret, err := a.promptCredentials(ctx, clientID, clientSecret)
	if err != nil {
		return err
	}
	profile := cliauth.Profile{Server: server, ClientID: clientID, ClientSecret: clientSecret}
	if profile.Cache, err = proveCredentials(ctx, server, profile); err != nil {
		return err
	}
	name, err := a.saveLogin(server, profile)
	if err != nil {
		return err
	}
	return printSuccess(a.statusWriter(), fmt.Sprintf("Logged in to %s as %s (context %s)", server, clientID, name))
}

// requireAuth fails for a server that is unreachable or runs without authentication.
func requireAuth(ctx context.Context, server string) error {
	ctx, cancel := context.WithTimeout(ctx, loginTimeout)
	defer cancel()
	config, err := authv1connect.NewAuthServiceClient(http.DefaultClient, server).GetAuthConfig(ctx, connect.NewRequest(&authv1.GetAuthConfigRequest{}))
	if err != nil {
		return fmt.Errorf("reach %s: %w", server, err)
	}
	if config.Msg.GetIssuer() == "" {
		return fmt.Errorf("%s runs without authentication; add it with `alchemy context add NAME --server %s`", server, server)
	}
	return nil
}

// proveCredentials mints a token and checks the server accepts it.
func proveCredentials(ctx context.Context, server string, profile cliauth.Profile) (*cliauth.Cache, error) {
	ctx, cancel := context.WithTimeout(ctx, loginTimeout)
	defer cancel()
	cache, err := cliauth.Mint(ctx, profile)
	if err != nil {
		return nil, fmt.Errorf("login to %s failed: %w", server, err)
	}
	verify := connect.NewRequest(&functionsv1.ListFunctionsRequest{
		Pagination: &functionsv1.PaginationRequest{PageSize: verifyPageSize},
	})
	setBearer(verify.Header(), cache.AccessToken)
	if _, err := functionsv1connect.NewFunctionsServiceClient(http.DefaultClient, server).ListFunctions(ctx, verify); err != nil {
		return nil, fmt.Errorf("%s rejected the minted token: %w", server, err)
	}
	return &cache, nil
}

// saveLogin stores the profile and selects its context, undoing the first if the second fails.
func (a *cliApp) saveLogin(server string, profile cliauth.Profile) (string, error) {
	registry := a.contextRegistry()
	items, err := registry.List()
	if err != nil {
		return "", err
	}
	name := a.contextName
	if name == "" {
		name = availableContextName(items, serverContextName(server), server)
	}
	key := profileKey(items, name)
	store := a.credentialStore()
	credentials, err := store.Load()
	if err != nil {
		return "", err
	}
	previous, hadPrevious := credentials.Profiles[key]
	if err := store.Put(key, profile); err != nil {
		return "", err
	}
	if _, err := registry.SetAndUse(name, contexts.Target{Endpoint: server, AuthProfile: key}); err != nil {
		if hadPrevious {
			return "", errors.Join(err, store.Put(key, previous))
		}
		return "", errors.Join(err, store.Delete(key))
	}
	return name, nil
}

func (a *cliApp) authStatus() error {
	current, err := a.contextRegistry().Resolve(a.contextName)
	if err != nil {
		return err
	}
	if current.Target.AuthProfile == "" {
		_, err := fmt.Fprintf(a.stdout, "Context %s is not logged in.\n", current.Name)
		return err
	}
	profile, err := a.credentialStore().Get(current.Target.AuthProfile)
	switch {
	case errors.Is(err, cliauth.ErrProfileNotFound):
		_, err := fmt.Fprintf(a.stdout, "Context %s is not logged in. Run alchemy auth login.\n", current.Name)
		return err
	case errors.Is(err, configfile.ErrMalformed):
		return fmt.Errorf("%w; fix or remove it, then run alchemy auth login", err)
	case err != nil:
		return err
	}
	return text.Details(a.stdout, [][2]string{
		{"Context", current.Name},
		{"Server", current.Target.Endpoint},
		{"Client ID", profile.ClientID},
		{"Token", tokenState(profile.Cache)},
	})
}

func (a *cliApp) authLogout() error {
	registry := a.contextRegistry()
	current, err := registry.Resolve(a.contextName)
	if err != nil {
		return err
	}
	if current.Target.AuthProfile == "" {
		return fmt.Errorf("context %q holds no credentials", current.Name)
	}
	detached := current.Target
	detached.AuthProfile = ""
	if err := registry.Set(current.Name, detached); err != nil {
		return err
	}
	if err := a.removeUnusedProfile(registry, current.Target.AuthProfile); err != nil {
		return errors.Join(err, registry.Set(current.Name, current.Target))
	}
	return printSuccess(a.statusWriter(), "Logged out of context "+current.Name)
}

// serverContextName turns a server URL into a context name.
func serverContextName(server string) string {
	parsed, err := url.Parse(server)
	if err != nil {
		return fallbackContextName
	}
	name := strings.Trim(unnameable.ReplaceAllString(parsed.Host+parsed.EscapedPath(), "-"), ".-_")
	if name == "" || name == contexts.DefaultName {
		return fallbackContextName
	}
	return name
}

// availableContextName reuses base for the same server, or numbers a new one.
func availableContextName(items []contexts.NamedTarget, base, endpoint string) string {
	used := make(map[string]contexts.Target, len(items))
	for _, item := range items {
		used[item.Name] = item.Target
	}
	if target, exists := used[base]; !exists || target.Endpoint == endpoint {
		return base
	}
	return numbered(base, func(candidate string) bool {
		_, exists := used[candidate]
		return exists
	})
}

// profileKey keeps the context's own profile, or picks a key no other context uses.
func profileKey(items []contexts.NamedTarget, name string) string {
	current := ""
	shared := map[string]bool{}
	for _, item := range items {
		if item.Name == name {
			current = item.Target.AuthProfile
			continue
		}
		shared[item.Target.AuthProfile] = true
	}
	switch {
	case current != "" && !shared[current]:
		return current
	case !shared[name]:
		return name
	default:
		return numbered(name, func(candidate string) bool { return shared[candidate] })
	}
}

// numbered appends the first suffix that makes base free.
func numbered(base string, taken func(string) bool) string {
	for suffix := firstSuffix; ; suffix++ {
		if candidate := fmt.Sprintf("%s-%d", base, suffix); !taken(candidate) {
			return candidate
		}
	}
}

// promptCredentials fills whichever credential flags were omitted.
func (a *cliApp) promptCredentials(ctx context.Context, clientID, clientSecret string) (string, string, error) {
	reader := bufio.NewReader(a.stdin)
	var err error
	if clientID == "" {
		if clientID, err = promptValue(ctx, reader, a.statusWriter(), "Client ID: "); err != nil {
			return "", "", err
		}
	}
	if clientSecret == "" {
		if clientSecret, err = promptSecret(ctx, a.stdin, reader, a.statusWriter(), "Client secret: "); err != nil {
			return "", "", err
		}
	}
	return clientID, clientSecret, nil
}

func promptValue(ctx context.Context, reader *bufio.Reader, out io.Writer, label string) (string, error) {
	if _, err := fmt.Fprint(out, label); err != nil {
		return "", err
	}
	line, err := readLine(ctx, reader)
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	value := strings.TrimSpace(line)
	if value == "" {
		return "", errValueRequired
	}
	return value, nil
}

// promptSecret reads without echo on a terminal.
func promptSecret(ctx context.Context, in io.Reader, reader *bufio.Reader, out io.Writer, label string) (string, error) {
	file, ok := style.Terminal(in)
	if !ok {
		return promptValue(ctx, reader, out, label)
	}
	if _, err := fmt.Fprint(out, label); err != nil {
		return "", err
	}
	descriptor := int(file.Fd()) //nolint:gosec // a file descriptor fits an int
	echoing, err := term.GetState(descriptor)
	if err != nil {
		return "", err
	}
	secret, err := await(ctx, func() ([]byte, error) { return term.ReadPassword(descriptor) })
	if ctx.Err() != nil {
		// The abandoned read never restores echo, so it is restored here.
		_ = term.Restore(descriptor, echoing)
	}
	if _, printErr := fmt.Fprintln(out); printErr != nil {
		return "", printErr
	}
	if err != nil {
		return "", err
	}
	if len(secret) == 0 {
		return "", errValueRequired
	}
	return string(secret), nil
}
