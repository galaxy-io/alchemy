package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/galaxy-io/alchemy/internal/secret"

	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
)

// SecretStore is the secrets table as the datastore secret provider
// uses it. Every ref the server mints is scoped to a tenant, so a ref
// without one is refused rather than matched across tenants.
type SecretStore struct {
	q *sqlcgen.Queries
}

var _ secret.Store = (*SecretStore)(nil)

// Secrets returns the secrets table for the datastore provider.
func (s *Store) Secrets() *SecretStore { return &SecretStore{q: s.Queries} }

// Put inserts the row or replaces the one at its tenant and ref.
func (st *SecretStore) Put(ctx context.Context, r secret.Row) error {
	if err := owned(r.Tenant, r.Ref); err != nil {
		return err
	}
	return st.q.PutSecret(ctx, sqlcgen.PutSecretParams{
		TenantID: r.Tenant, Ref: r.Ref, Ciphertext: r.Ciphertext, Nonce: r.Nonce, KeyID: r.KeyID, Metadata: r.Meta,
	})
}

// Replace updates the row at its tenant and ref, reporting false when
// there is none.
func (st *SecretStore) Replace(ctx context.Context, r secret.Row) (bool, error) {
	if err := owned(r.Tenant, r.Ref); err != nil {
		return false, err
	}
	n, err := st.q.ReplaceSecret(ctx, sqlcgen.ReplaceSecretParams{
		TenantID: r.Tenant, Ref: r.Ref, Ciphertext: r.Ciphertext, Nonce: r.Nonce, KeyID: r.KeyID, Metadata: r.Meta,
	})
	return n > 0, err
}

// Get returns the tenant's row at ref, wrapping secret.ErrNotFound when
// there is none.
func (st *SecretStore) Get(ctx context.Context, tenant, ref string) (secret.Row, error) {
	if err := owned(tenant, ref); err != nil {
		return secret.Row{}, err
	}
	row, err := st.q.GetSecret(ctx, sqlcgen.GetSecretParams{TenantID: tenant, Ref: ref})
	if errors.Is(err, pgx.ErrNoRows) {
		return secret.Row{}, fmt.Errorf("%w: %s", secret.ErrNotFound, ref)
	}
	if err != nil {
		return secret.Row{}, err
	}
	return secret.Row{
		Tenant: row.TenantID, Ref: row.Ref, Ciphertext: row.Ciphertext, Nonce: row.Nonce, KeyID: row.KeyID, Meta: row.Metadata,
	}, nil
}

// Delete removes the tenant's row at ref; a missing row is not an error.
func (st *SecretStore) Delete(ctx context.Context, tenant, ref string) error {
	if err := owned(tenant, ref); err != nil {
		return err
	}
	return st.q.DeleteSecret(ctx, sqlcgen.DeleteSecretParams{TenantID: tenant, Ref: ref})
}

func owned(tenant, ref string) error {
	if tenant == "" {
		return fmt.Errorf("secret: ref %q has no tenant", ref)
	}
	return nil
}
