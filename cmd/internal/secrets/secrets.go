// Package secrets selects the server's secret provider.
package secrets

import (
	"errors"
	"fmt"
	"os"

	"github.com/galaxy-io/alchemy/internal/secret"
)

// FromEnv selects the provider per SECRET_PROVIDER. Unset, secrets live in
// the datastore, encrypted with ENCRYPTION_KEY, a base64 AES key, under the
// key id ENCRYPTION_KEY_ID. With no key the server has no provider and the
// secrets API refuses, which is a warning at start, not an error.
func FromEnv(store secret.Store, scope secret.Scope) (secret.Secrets, error) {
	switch provider := os.Getenv("SECRET_PROVIDER"); provider {
	case "", "datastore":
		if os.Getenv("ENCRYPTION_KEY") == "" {
			return nil, nil //nolint:nilnil // no provider is a state the server runs in
		}
		return secret.NewFromEnv(store, scope, secret.WithName("postgres"))
	default:
		return nil, errors.Join(fmt.Errorf("SECRET_PROVIDER %q is not one of: datastore", provider))
	}
}
