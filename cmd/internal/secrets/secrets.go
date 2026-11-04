// Package secrets selects the server's secret provider.
package secrets

import (
	"context"
	"fmt"
	"os"

	"github.com/galaxy-io/modules/secret"
	"github.com/galaxy-io/modules/secret/aws"
	"github.com/galaxy-io/modules/secret/datastore"
	"github.com/galaxy-io/modules/secret/gcp"
)

// FromEnv selects the provider per SECRET_PROVIDER. Unset, secrets live in
// the datastore, encrypted with ENCRYPTION_KEY, a base64 AES key, under the
// key id ENCRYPTION_KEY_ID. With no key the server has no provider and the
// secrets API refuses, which is a warning at start, not an error. External
// providers use their SDK's default credential chain and root secret names at
// SECRETS_PREFIX when set.
func FromEnv(ctx context.Context, store datastore.Store, scope secret.Scope) (secret.Secrets, error) {
	switch provider := os.Getenv("SECRET_PROVIDER"); provider {
	case "", "datastore":
		if os.Getenv("ENCRYPTION_KEY") == "" {
			return nil, nil //nolint:nilnil // no provider is a state the server runs in
		}
		return datastore.NewFromEnv(store, scope, datastore.WithName("postgres"))
	case "aws-secrets-manager":
		var opts []aws.Option
		if prefix := os.Getenv("SECRETS_PREFIX"); prefix != "" {
			opts = append(opts, aws.WithPrefix(prefix))
		}
		return aws.NewFromConfig(ctx, scope, opts...)
	case "gcp-secret-manager":
		var opts []gcp.Option
		if prefix := os.Getenv("SECRETS_PREFIX"); prefix != "" {
			opts = append(opts, gcp.WithPrefix(prefix))
		}
		return gcp.NewFromConfig(ctx, scope, os.Getenv("GCP_PROJECT_ID"), os.Getenv("GCP_REGION"), opts...)
	default:
		return nil, fmt.Errorf("SECRET_PROVIDER %q is not one of: datastore, aws-secrets-manager, gcp-secret-manager", provider)
	}
}
