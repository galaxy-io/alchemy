package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"maps"
	"regexp"
	"slices"
	"strings"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/proto"

	"github.com/galaxy-io/modules/identity"
	"github.com/galaxy-io/modules/secret"

	"github.com/galaxy-io/alchemy/internal/bus"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
)

// SecretScope is the namespace alchemy mints secret refs under:
// alchemy/<tenant>/<name>.
var SecretScope = secret.Scope{Prefix: "alchemy/"}

// secretNameSep joins a secret name's function, suffix and variable.
const secretNameSep = "."

var (
	envName    = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	secretName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)
)

// checkSecrets validates spec.secrets: every variable is a valid name and
// every secret is one of functionID's and exists in the tenant's provider.
// A new function, with functionID empty, has none yet.
func (s *Service) checkSecrets(ctx context.Context, functionID string, spec *functionsv1.FunctionSpec) error {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	invalid := func(format string, args ...any) error {
		return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf(format, args...))
	}
	if len(spec.GetSecrets()) > 0 && s.secrets == nil {
		return connect.NewError(connect.CodeFailedPrecondition, errors.New("the server has no secret provider, so spec.secrets cannot be used"))
	}
	for variable, name := range spec.GetSecrets() {
		if !envName.MatchString(variable) {
			return invalid("spec.secrets: %q is not an environment variable name", variable)
		}
		if !secretName.MatchString(name) {
			return invalid("spec.secrets[%s]: %q is not a secret name", variable, name)
		}
		if !ownsSecret(functionID, name) {
			return connect.NewError(connect.CodePermissionDenied, fmt.Errorf("spec.secrets[%s]: %q is not this function's secret, send its value in secret_values", variable, name))
		}
		if _, err := s.secrets.Read(ctx, SecretScope.Ref(tenant, name)); err != nil {
			if errors.Is(err, secret.ErrNotFound) {
				return connect.NewError(connect.CodeNotFound, fmt.Errorf("spec.secrets[%s]: secret %q not found", variable, name))
			}
			return connect.NewError(connect.CodeUnavailable, fmt.Errorf("spec.secrets[%s]: %w", variable, err))
		}
	}
	return nil
}

// ownsSecret reports whether name is one storeSecretValues made for
// functionID.
func ownsSecret(functionID, name string) bool {
	return functionID != "" && strings.HasPrefix(name, functionID+secretNameSep)
}

// storeSecretValues creates a secret per value and names each in
// spec.secrets. The names are the function, a random suffix shared by this
// version's values, and the variable: every version gets secrets of its
// own, so a new version never changes what an older one reads. The spec is
// the caller's copy.
func (s *Service) storeSecretValues(ctx context.Context, functionID string, spec *functionsv1.FunctionSpec, values map[string]string) error {
	tenant, err := tenantFromContext(ctx)
	if err != nil {
		return err
	}
	if len(values) == 0 {
		return nil
	}
	if s.secrets == nil {
		return connect.NewError(connect.CodeFailedPrecondition, errors.New("the server has no secret provider, so secret_values cannot be used"))
	}
	raw := make([]byte, 4)
	if _, err := rand.Read(raw); err != nil {
		return connect.NewError(connect.CodeInternal, err)
	}
	prefix := functionID + secretNameSep + hex.EncodeToString(raw) + secretNameSep
	var written []string
	for _, variable := range slices.Sorted(maps.Keys(values)) {
		if !envName.MatchString(variable) {
			return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("secret_values: %q is not an environment variable name", variable))
		}
		if values[variable] == "" {
			return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("secret_values[%s]: value is required", variable))
		}
		name := prefix + variable
		if !secretName.MatchString(name) {
			return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("secret_values: %q is too long for a secret name", variable))
		}
		if err := s.secrets.Write(ctx, SecretScope.Ref(tenant, name), secret.Secret{Tenant: tenant, Value: []byte(values[variable])}); err != nil {
			return connect.NewError(connect.CodeInternal, err)
		}
		if spec.Secrets == nil {
			spec.Secrets = make(map[string]string)
		}
		spec.Secrets[variable] = name
		written = append(written, name)
	}
	s.invalidateSecrets(tenant, written)
	return nil
}

// invalidateSecrets tells every host to drop its cached values for tenant's
// names, so a rotated value takes effect on the next invocation. It is best
// effort; the refresh interval is the backstop.
func (s *Service) invalidateSecrets(tenant string, names []string) {
	if len(names) == 0 {
		return
	}
	msg := &hostv1.SecretsInvalidate{TenantId: tenant, Names: names}
	if err := s.bus.Publish(bus.HostSecretsInvalidateSubject, msg); err != nil {
		s.log.Warn("invalidate secrets", "err", err)
	}
}

// handleSecrets answers a live host's request for a function's secret
// values. Any host may run any function, so any live host may ask.
func (s *Service) handleSecrets(ctx context.Context, data []byte) proto.Message {
	req := &hostv1.SecretsRequest{}
	if err := proto.Unmarshal(data, req); err != nil {
		return &hostv1.SecretsResponse{Error: &hostv1.Error{Code: "invalid_argument", Message: err.Error()}}
	}
	if s.secrets == nil {
		return &hostv1.SecretsResponse{Error: &hostv1.Error{Code: "failed_precondition", Message: "the server has no secret provider"}}
	}
	if !s.hostLive(req.GetHost()) {
		return &hostv1.SecretsResponse{Error: &hostv1.Error{Code: "permission_denied", Message: fmt.Sprintf("host %q is not live", req.GetHost())}}
	}
	// A host asks on its function's tenant's behalf: the version lookup
	// below finds the function only in that tenant, and a host gets only the
	// secrets the version it runs names.
	ctx = identity.WithTenant(ctx, req.GetTenantId())
	named, err := s.versionSecrets(ctx, req.GetFunctionId(), req.GetVersion())
	if err != nil {
		return &hostv1.SecretsResponse{Error: &hostv1.Error{Code: "not_found", Message: err.Error()}}
	}
	for _, name := range req.GetNames() {
		if !named[name] {
			return &hostv1.SecretsResponse{Error: &hostv1.Error{Code: "permission_denied", Message: fmt.Sprintf("version %d of function %q does not name secret %q", req.GetVersion(), req.GetFunctionId(), name)}}
		}
	}
	values := make(map[string]string, len(req.GetNames()))
	for _, name := range req.GetNames() {
		sec, err := s.secrets.Read(ctx, SecretScope.Ref(req.GetTenantId(), name))
		if err != nil {
			return &hostv1.SecretsResponse{Values: values, Error: &hostv1.Error{Code: "not_found", Message: fmt.Sprintf("secret %q: %v", name, err)}}
		}
		values[name] = string(sec.Value)
	}
	return &hostv1.SecretsResponse{Values: values}
}

// versionSecrets is the set of secret names a version of one of this
// tenant's functions names in spec.secrets.
func (s *Service) versionSecrets(ctx context.Context, functionID string, version int64) (map[string]bool, error) {
	row, err := s.version(ctx, functionID, version)
	if err != nil {
		return nil, err
	}
	spec, err := decodeSpec(row.Spec)
	if err != nil {
		return nil, err
	}
	named := make(map[string]bool, len(spec.GetSecrets()))
	for _, name := range spec.GetSecrets() {
		named[name] = true
	}
	return named, nil
}
