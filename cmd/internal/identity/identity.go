// Package identity selects the authentication provider.
package identity

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/galaxy-io/modules/identity"
	"github.com/galaxy-io/modules/identity/keycloak"
	"github.com/galaxy-io/modules/identity/proxy"
	"github.com/galaxy-io/modules/identity/zitadel"
)

// app names alchemy to the provider: the session cookie, the attributes kept
// on users and clients, and what the provider creates are all prefixed with it.
const app = "alchemy"

// FromEnv selects the authenticator per AUTH_PROVIDER. Unset leaves alchemy
// unauthenticated: a nil authenticator is the disabled state, not an error,
// and every request runs in the default tenant. Every provider takes
// AUTH_ISSUER and AUTH_UI_ORIGIN, the origin the UI is served from; an https
// origin marks the session cookie Secure.
//
// AUTH_BOOTSTRAP_TENANT is converged on every boot. AUTH_BOOTSTRAP_ADMIN_EMAIL
// and AUTH_BOOTSTRAP_ADMIN_PASSWORD administer it and close sign-up:
// registration is refused.
func FromEnv(ctx context.Context) (identity.Authenticator, error) {
	switch provider := os.Getenv("AUTH_PROVIDER"); provider {
	case "":
		return nil, nil //nolint:nilnil // no authenticator is the disabled state
	// Trusts identity headers from a gateway that authenticated the caller.
	// AUTH_PROXY_TENANT, when set, pins the one gateway tenant this
	// deployment serves; any other is refused. Sign-in happens at the gateway.
	case "proxy":
		return proxy.New(os.Getenv("AUTH_PROXY_TENANT")), nil
	// The machine-user token in AUTH_PAT.
	case "zitadel":
		pat := os.Getenv("AUTH_PAT")
		if pat == "" {
			return nil, errors.New("identity: AUTH_PAT is required for AUTH_PROVIDER=zitadel")
		}
		return zitadel.New(ctx, zitadel.Options{
			App:      app,
			Issuer:   os.Getenv("AUTH_ISSUER"),
			PAT:      pat,
			UIOrigin: uiOrigin(),
			Bootstrap: zitadel.Bootstrap{
				Tenant:        os.Getenv("AUTH_BOOTSTRAP_TENANT"),
				AdminEmail:    os.Getenv("AUTH_BOOTSTRAP_ADMIN_EMAIL"),
				AdminPassword: os.Getenv("AUTH_BOOTSTRAP_ADMIN_PASSWORD"),
			},
		})
	// AUTH_ISSUER is the realm URL and alchemy's client is AUTH_CLIENT_ID and
	// AUTH_CLIENT_SECRET. With the admin in AUTH_ADMIN_USERNAME and
	// AUTH_ADMIN_PASSWORD it creates the realm and client itself. The
	// bootstrap tenant also takes an admin service account in
	// AUTH_BOOTSTRAP_CLIENT_ID and AUTH_BOOTSTRAP_CLIENT_SECRET.
	case "keycloak":
		clientID, clientSecret := os.Getenv("AUTH_CLIENT_ID"), os.Getenv("AUTH_CLIENT_SECRET")
		if clientID == "" || clientSecret == "" {
			return nil, errors.New("identity: AUTH_CLIENT_ID and AUTH_CLIENT_SECRET are required for AUTH_PROVIDER=keycloak")
		}
		return keycloak.New(ctx, keycloak.Options{
			App:           app,
			Issuer:        os.Getenv("AUTH_ISSUER"),
			ClientID:      clientID,
			ClientSecret:  clientSecret,
			UIOrigin:      uiOrigin(),
			AdminUsername: os.Getenv("AUTH_ADMIN_USERNAME"),
			AdminPassword: os.Getenv("AUTH_ADMIN_PASSWORD"),
			Bootstrap: keycloak.Bootstrap{
				Tenant:        os.Getenv("AUTH_BOOTSTRAP_TENANT"),
				ClientID:      os.Getenv("AUTH_BOOTSTRAP_CLIENT_ID"),
				ClientSecret:  os.Getenv("AUTH_BOOTSTRAP_CLIENT_SECRET"),
				AdminEmail:    os.Getenv("AUTH_BOOTSTRAP_ADMIN_EMAIL"),
				AdminPassword: os.Getenv("AUTH_BOOTSTRAP_ADMIN_PASSWORD"),
			},
		})
	default:
		return nil, fmt.Errorf("identity: unknown AUTH_PROVIDER %q (zitadel, keycloak, proxy)", provider)
	}
}

// uiOrigin defaults to the Vite dev server.
func uiOrigin() string {
	if origin := os.Getenv("AUTH_UI_ORIGIN"); origin != "" {
		return origin
	}
	return "http://localhost:5173"
}
