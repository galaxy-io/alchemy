package host

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"slices"
	"sync"
	"time"

	"google.golang.org/protobuf/proto"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/internal/bus"
)

// secretCache holds the secret values this host has fetched, by tenant and
// name, in memory only. A value is fetched again once it is older than the
// refresh interval, and a fetch that fails leaves the old value in use.
type secretCache struct {
	mu     sync.Mutex
	values map[string]cachedSecret
}

type cachedSecret struct {
	value string
	at    time.Time
}

func secretKey(tenantID, name string) string { return tenantID + "/" + name }

// secretEnv is the environment an invocation of a gets from its secrets,
// variable name to value, fetched from a server where the cache is cold or
// stale.
func (h *Host) secretEnv(ctx context.Context, a *hostv1.Artifact) (map[string]string, error) {
	if len(a.GetSecrets()) == 0 {
		return nil, nil
	}
	now := time.Now()
	h.secrets.mu.Lock()
	var missing []string
	for _, name := range a.GetSecrets() {
		c, ok := h.secrets.values[secretKey(a.GetTenantId(), name)]
		if !ok || now.Sub(c.at) > h.cfg.SecretsRefresh {
			missing = append(missing, name)
		}
	}
	h.secrets.mu.Unlock()

	if len(missing) > 0 {
		slices.Sort(missing)
		missing = slices.Compact(missing)
		fetched, err := h.fetchSecrets(ctx, a, missing)
		h.secrets.mu.Lock()
		for name, value := range fetched {
			h.secrets.values[secretKey(a.GetTenantId(), name)] = cachedSecret{value: value, at: now}
		}
		h.secrets.mu.Unlock()
		if err != nil {
			h.log.Warn("fetch secrets", "function_id", a.GetFunctionId(), "err", err)
		}
	}

	h.secrets.mu.Lock()
	defer h.secrets.mu.Unlock()
	env := make(map[string]string, len(a.GetSecrets()))
	for variable, name := range a.GetSecrets() {
		c, ok := h.secrets.values[secretKey(a.GetTenantId(), name)]
		if !ok {
			return nil, fmt.Errorf("secret %q is not available", name)
		}
		env[variable] = c.value
	}
	return env, nil
}

// invocationSecrets is secretEnv as invoke uses it: the environment,
// or the reply when the secrets could not be had. The instance ran nothing,
// so it stays reusable.
func (h *Host) invocationSecrets(ctx context.Context, a *hostv1.Artifact, log *slog.Logger) (map[string]string, *hostv1.InvokeResponse) {
	env, err := h.secretEnv(ctx, a)
	if err != nil {
		log.Warn("secrets", "err", err)
		return nil, invokeError("unavailable", fmt.Errorf("secrets: %w", err))
	}
	return env, nil
}

// handleSecretsInvalidate drops this host's cached values for the named
// secrets, so a rotated value is refetched on the next invocation.
func (h *Host) handleSecretsInvalidate(_ context.Context, data []byte) proto.Message {
	msg := &hostv1.SecretsInvalidate{}
	if err := proto.Unmarshal(data, msg); err != nil {
		h.log.Warn("invalidate secrets", "err", err)
		return nil
	}
	h.secrets.mu.Lock()
	for _, name := range msg.GetNames() {
		delete(h.secrets.values, secretKey(msg.GetTenantId(), name))
	}
	h.secrets.mu.Unlock()
	return nil
}

// fetchSecrets asks a server for names' values.
func (h *Host) fetchSecrets(ctx context.Context, a *hostv1.Artifact, names []string) (map[string]string, error) {
	ctx, cancel := context.WithTimeout(ctx, secretsFetchTimeout)
	defer cancel()
	resp := &hostv1.SecretsResponse{}
	req := &hostv1.SecretsRequest{Host: h.cfg.Name, TenantId: a.GetTenantId(), FunctionId: a.GetFunctionId(), Version: a.GetVersion(), Names: names}
	if err := h.bus.Request(ctx, bus.ServerSecretsSubject, req, resp); err != nil {
		return nil, err
	}
	if e := resp.GetError(); e != nil {
		return resp.GetValues(), errors.New(e.GetMessage())
	}
	return maps.Clone(resp.GetValues()), nil
}

const secretsFetchTimeout = 5 * time.Second
