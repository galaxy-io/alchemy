// Package secret resolves opaque references to secret material, keeping
// plaintext out of configs and the datastore. The datastore provider encrypts
// values with AES-GCM into the app's own secrets table and enforces the
// scope's tenant rule; the app owns the schema and supplies the rows through
// Store.
package secret

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

// ErrNotFound reports a ref with no secret behind it.
var ErrNotFound = errors.New("secret: not found")

// Secrets resolves opaque references to secret material.
type Secrets interface {
	Read(ctx context.Context, ref string) (Secret, error)
	Write(ctx context.Context, ref string, s Secret) error
	Delete(ctx context.Context, ref string) error
	Name() string
}

// Secret is plaintext, in-memory only; never logged, never on the bus.
type Secret struct {
	Tenant string
	Value  []byte
	Meta   map[string]string
}

// Rotator replaces the value of an existing secret without creating a secret
// or changing its reference. Rotation must not recreate a deleted secret.
// Implementations preserve tenant isolation and encrypt values at rest.
type Rotator interface {
	RotateSecret(ctx context.Context, ref string, s Secret) error
}

// Scope is the namespace an app mints tenant-owned refs under:
// <Prefix><tenant>/<parts...>, such as "alchemy/<tenant>/<name>". Refs outside
// the prefix carry no tenant.
type Scope struct {
	// Prefix is the app's root segment with its trailing slash, such as
	// "alchemy/".
	Prefix string
}

// Validate requires a single root segment ending in a slash.
func (s Scope) Validate() error {
	root, ok := strings.CutSuffix(s.Prefix, "/")
	if !ok || root == "" || strings.Contains(root, "/") {
		return fmt.Errorf("secret: scope prefix %q must be one segment followed by a slash", s.Prefix)
	}
	return nil
}

// Root is the prefix without its trailing slash, such as "alchemy".
func (s Scope) Root() string { return strings.TrimSuffix(s.Prefix, "/") }

// Ref builds the canonical ref for a secret tenant owns.
func (s Scope) Ref(tenant string, parts ...string) string {
	return s.Prefix + strings.Join(append([]string{tenant}, parts...), "/")
}

// Owner returns the tenant a scoped ref belongs to. It reports false for a ref
// outside the scope, and fails for a scoped ref with no tenant segment.
func (s Scope) Owner(ref string) (string, bool, error) {
	rest, scoped := strings.CutPrefix(ref, s.Prefix)
	if !scoped {
		return "", false, nil
	}
	owner, _, ok := strings.Cut(rest, "/")
	if !ok || owner == "" {
		return "", true, fmt.Errorf("secret: malformed scoped ref %q", ref)
	}
	return owner, true, nil
}

// Check enforces the cross-tenant isolation rule for a ref-keyed store: a ref
// in the scope may only be read or written by its owning tenant. Refs outside
// the scope carry no tenant and pass through.
func (s Scope) Check(ref, tenant string) error {
	owner, scoped, err := s.Owner(ref)
	if err != nil || !scoped {
		return err
	}
	if owner != tenant {
		return fmt.Errorf("secret: ref %q is not owned by tenant %q", ref, tenant)
	}
	return nil
}

// Row is one encrypted secret as the app stores it.
type Row struct {
	Tenant     string
	Ref        string
	Ciphertext []byte
	Nonce      []byte
	KeyID      string
	// Meta is the JSON-encoded secret metadata.
	Meta []byte
}

// Store persists rows in the app's secrets table, unique on (tenant, ref) and
// on ref. tenant on Get and Delete is the owner of a scoped ref and empty for
// a ref outside the scope; a store matches on it when it is set.
type Store interface {
	// Put inserts the row or replaces the one at (tenant, ref).
	Put(ctx context.Context, r Row) error
	// Replace updates the row at (tenant, ref), reporting false when none
	// exists. It never inserts.
	Replace(ctx context.Context, r Row) (bool, error)
	// Get returns the row at ref, wrapping ErrNotFound when missing.
	Get(ctx context.Context, tenant, ref string) (Row, error)
	// Delete removes the row at ref; a missing row is not an error.
	Delete(ctx context.Context, tenant, ref string) error
}

// Provider encrypts secret values with AES-GCM before handing them to Store.
type Provider struct {
	store Store
	scope Scope
	keyID string
	gcm   cipher.AEAD
	name  string
}

var (
	_ Secrets = (*Provider)(nil)
	_ Rotator = (*Provider)(nil)
)

// Option configures a Provider.
type Option func(*Provider)

// WithName replaces the default "datastore" provider name, such as with the
// backing datastore's.
func WithName(name string) Option { return func(p *Provider) { p.name = name } }

// NewFromEnv constructs a provider from ENCRYPTION_KEY (base64-encoded AES
// key) and ENCRYPTION_KEY_ID (defaults to "default").
func NewFromEnv(store Store, scope Scope, opts ...Option) (*Provider, error) {
	encoded := os.Getenv("ENCRYPTION_KEY")
	if encoded == "" {
		return nil, errors.New("secret: ENCRYPTION_KEY is required")
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("secret: ENCRYPTION_KEY must be base64: %w", err)
	}
	keyID := os.Getenv("ENCRYPTION_KEY_ID")
	if keyID == "" {
		keyID = "default"
	}
	return New(store, scope, keyID, key, opts...)
}

// New constructs a provider. key must be 16, 24, or 32 bytes.
func New(store Store, scope Scope, keyID string, key []byte, opts ...Option) (*Provider, error) {
	if err := scope.Validate(); err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("secret: key: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("secret: gcm: %w", err)
	}
	p := &Provider{store: store, scope: scope, keyID: keyID, gcm: gcm, name: "datastore"}
	for _, opt := range opts {
		opt(p)
	}
	return p, nil
}

// Name returns the provider identifier.
func (p *Provider) Name() string { return p.name }

// Write stores s at ref, creating or replacing it.
func (p *Provider) Write(ctx context.Context, ref string, s Secret) error {
	return p.write(ctx, ref, s, false)
}

// RotateSecret updates an existing tenant-owned secret without inserting a row.
func (p *Provider) RotateSecret(ctx context.Context, ref string, s Secret) error {
	return p.write(ctx, ref, s, true)
}

func (p *Provider) write(ctx context.Context, ref string, s Secret, rotate bool) error {
	if s.Tenant == "" {
		return errors.New("secret: tenant is required")
	}
	if err := p.scope.Check(ref, s.Tenant); err != nil {
		return err
	}
	nonce := make([]byte, p.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return fmt.Errorf("secret: nonce: %w", err)
	}
	meta, err := json.Marshal(s.Meta)
	if err != nil {
		return fmt.Errorf("secret: marshal metadata: %w", err)
	}
	row := Row{Tenant: s.Tenant, Ref: ref, Ciphertext: p.gcm.Seal(nil, nonce, s.Value, nil), Nonce: nonce, KeyID: p.keyID, Meta: meta}
	if rotate {
		var found bool
		found, err = p.store.Replace(ctx, row)
		if err == nil && !found {
			return ErrNotFound
		}
	} else {
		err = p.store.Put(ctx, row)
	}
	if err != nil {
		return fmt.Errorf("secret: write: %w", err)
	}
	return nil
}

// Read returns the decrypted secret at ref.
func (p *Provider) Read(ctx context.Context, ref string) (Secret, error) {
	owner, _, err := p.scope.Owner(ref)
	if err != nil {
		return Secret{}, err
	}
	row, err := p.store.Get(ctx, owner, ref)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Secret{}, fmt.Errorf("read secret %q: %w", ref, ErrNotFound)
		}
		return Secret{}, fmt.Errorf("secret: read: %w", err)
	}
	value, err := p.gcm.Open(nil, row.Nonce, row.Ciphertext, nil)
	if err != nil {
		return Secret{}, fmt.Errorf("secret: decrypt %q: %w", ref, err)
	}
	var meta map[string]string
	if len(row.Meta) > 0 {
		if err := json.Unmarshal(row.Meta, &meta); err != nil {
			return Secret{}, fmt.Errorf("secret: unmarshal metadata: %w", err)
		}
	}
	return Secret{Tenant: row.Tenant, Value: value, Meta: meta}, nil
}

// Delete removes the secret at ref; deleting a missing ref is a no-op.
func (p *Provider) Delete(ctx context.Context, ref string) error {
	owner, _, err := p.scope.Owner(ref)
	if err != nil {
		return err
	}
	if err := p.store.Delete(ctx, owner, ref); err != nil {
		return fmt.Errorf("secret: delete: %w", err)
	}
	return nil
}
