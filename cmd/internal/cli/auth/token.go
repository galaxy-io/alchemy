package auth

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"connectrpc.com/connect"

	authv1 "github.com/galaxy-io/modules/identity/auth/v1"
	"github.com/galaxy-io/modules/identity/auth/v1/authv1connect"
)

// expirySkew refreshes a cached token this long before it expires.
const expirySkew = time.Minute

// Source mints access tokens for one stored profile, reusing the cached one.
type Source struct {
	Store   Store
	Profile string
}

// Mint exchanges an in-memory profile for a token without persisting it.
func Mint(ctx context.Context, profile Profile) (Cache, error) {
	auth := authv1connect.NewAuthServiceClient(http.DefaultClient, profile.Server)
	res, err := auth.GetToken(ctx, connect.NewRequest(&authv1.GetTokenRequest{
		ClientId:     profile.ClientID,
		ClientSecret: profile.ClientSecret,
	}))
	if err != nil {
		if connect.CodeOf(err) == connect.CodeUnauthenticated {
			return Cache{}, fmt.Errorf("%w: %w", ErrTokenRejected, err)
		}
		return Cache{}, fmt.Errorf("%w: %s: %w", ErrAuthServerUnreachable, profile.Server, err)
	}
	return Cache{
		AccessToken: res.Msg.GetAccessToken(),
		ExpiresAt:   time.Now().Add(time.Duration(res.Msg.GetExpiresIn()) * time.Second),
	}, nil
}

// Token returns a valid access token, minting and persisting one when needed.
func (s Source) Token(ctx context.Context) (string, error) {
	profile, err := s.Store.Get(s.Profile)
	if err != nil {
		return "", err
	}
	if c := profile.Cache; c != nil && time.Now().Add(expirySkew).Before(c.ExpiresAt) {
		return c.AccessToken, nil
	}
	cache, err := Mint(ctx, profile)
	if err != nil {
		return "", err
	}
	if err := s.Store.SaveCache(s.Profile, cache); err != nil {
		return "", err
	}
	return cache.AccessToken, nil
}

// Invalidate discards the cached token so a retry mints a fresh one.
func (s Source) Invalidate() error { return s.Store.ClearCache(s.Profile) }
