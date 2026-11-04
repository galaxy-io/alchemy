package server

import (
	"context"
	"errors"
	"net/http"
	"sync"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/galaxy-io/modules/identity"
	authv1 "github.com/galaxy-io/modules/identity/auth/v1"
	"github.com/galaxy-io/modules/identity/auth/v1/authv1connect"

	"github.com/galaxy-io/alchemy/datastore/postgres"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
)

// tenantFromContext returns the tenant established by the auth interceptor.
// Missing tenant context is always an authentication failure: authenticated
// requests get it from their caller and auth-disabled requests get the
// default tenant from the same interceptor.
func tenantFromContext(ctx context.Context) (string, error) {
	tenant, ok := identity.TenantFrom(ctx)
	if !ok {
		return "", connect.NewError(connect.CodeUnauthenticated, errors.New("request tenant is unavailable"))
	}
	return tenant, nil
}

// disabledAuth answers AuthService with no provider: the config reports no
// issuer, so the UI renders without a session, and every other RPC is
// unimplemented.
type disabledAuth struct {
	authv1connect.UnimplementedAuthServiceHandler
}

func (disabledAuth) GetAuthConfig(context.Context, *connect.Request[authv1.GetAuthConfigRequest]) (*connect.Response[authv1.GetAuthConfigResponse], error) {
	return connect.NewResponse(&authv1.GetAuthConfigResponse{}), nil
}

// AuthHandler serves AuthService: the provider itself when it has a login of
// its own, and otherwise a config with no issuer, since people sign in
// upstream or not at all.
func AuthHandler(a identity.Authenticator) authv1connect.AuthServiceHandler {
	if p, ok := a.(identity.Provider); ok {
		return p
	}
	return disabledAuth{}
}

// publicProcedures are the AuthService RPCs a caller reaches before holding a
// token. Everything else requires authentication, so a new RPC is locked down
// until it is listed here.
var publicProcedures = map[string]bool{
	authv1connect.AuthServiceGetAuthConfigProcedure: true,
	authv1connect.AuthServiceLoginProcedure:         true,
	authv1connect.AuthServiceGetTokenProcedure:      true,
	authv1connect.AuthServiceLogoutProcedure:        true,
	authv1connect.AuthServiceRegisterProcedure:      true,
	authv1connect.AuthServiceAcceptInviteProcedure:  true,
}

// NewAuthInterceptor authenticates every RPC except the public session ones,
// resolves the caller's tenant and user to alchemy's own rows, and puts the
// caller on the context. With no provider every request runs in the default
// tenant.
func NewAuthInterceptor(provider identity.Authenticator, store *postgres.Store) *AuthInterceptor {
	return &AuthInterceptor{provider: provider, store: store}
}

// AuthInterceptor is a connect.Interceptor, and wraps plain HTTP handlers
// with Handler.
type AuthInterceptor struct {
	provider identity.Authenticator
	store    *postgres.Store
	// tenants caches ResolveTenant by provider organization id, and users
	// EnsureUser by tenant and provider subject: a row is minted once per
	// boot.
	tenants sync.Map
	users   sync.Map
}

type userKey struct{ tenant, userID string }

// WrapUnary authenticates a unary call before next runs it.
func (i *AuthInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		ctx, err := i.authenticate(ctx, req.Spec().Procedure, req.Header())
		if err != nil {
			return nil, err
		}
		return next(ctx, req)
	}
}

// WrapStreamingHandler authenticates a stream before next serves it.
func (i *AuthInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		ctx, err := i.authenticate(ctx, conn.Spec().Procedure, conn.RequestHeader())
		if err != nil {
			return err
		}
		return next(ctx, conn)
	}
}

// WrapStreamingClient leaves client streams alone: the server makes none.
func (i *AuthInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

// Handler authenticates requests to next as it does calls to procedure,
// answering failures the way a Connect handler would.
func (i *AuthInterceptor) Handler(procedure string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, err := i.authenticate(r.Context(), procedure, r.Header)
		if err != nil {
			writeError(w, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (i *AuthInterceptor) authenticate(ctx context.Context, procedure string, header http.Header) (context.Context, error) {
	if i.provider == nil {
		return identity.WithTenant(ctx, postgres.DefaultTenantID), nil
	}
	if publicProcedures[procedure] {
		return ctx, nil
	}
	caller, err := i.provider.Authenticate(ctx, header)
	if err != nil {
		// A provider that says why, such as an outage, keeps its code; anything
		// else is a rejected credential.
		var cerr *connect.Error
		if errors.As(err, &cerr) {
			return nil, err
		}
		return nil, connect.NewError(connect.CodeUnauthenticated, err)
	}
	if caller.TenantExternalID == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("token carries no tenant"))
	}
	tenant, ok := i.tenants.Load(caller.TenantExternalID)
	if !ok {
		resolved, err := i.store.ResolveTenant(ctx, sqlcgen.ResolveTenantParams{
			ExternalID: pgtype.Text{String: caller.TenantExternalID, Valid: true},
			Name:       caller.TenantName,
		})
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}
		tenant, _ = i.tenants.LoadOrStore(caller.TenantExternalID, resolved)
	}
	caller.Tenant = tenant.(string)
	// A service acts on its own behalf and has no user row.
	if caller.Service != "" {
		return identity.WithCaller(ctx, caller), nil
	}
	key := userKey{caller.Tenant, caller.UserID}
	id, ok := i.users.Load(key)
	if !ok {
		minted, err := i.store.EnsureUser(ctx, sqlcgen.EnsureUserParams{TenantID: caller.Tenant, ExternalID: caller.UserID})
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, err)
		}
		id, _ = i.users.LoadOrStore(key, minted)
	}
	caller.ID = id.(string)
	return identity.WithCaller(ctx, caller), nil
}
