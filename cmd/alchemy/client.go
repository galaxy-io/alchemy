package main

import (
	"context"
	"errors"
	"net/http"

	"connectrpc.com/connect"

	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
	cliauth "github.com/galaxy-io/alchemy/cmd/internal/cli/auth"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/contexts"
)

// dial resolves the context and builds its client once.
func (a *cliApp) dial() error {
	if a.functions != nil {
		return nil
	}
	selected, err := a.contextRegistry().Resolve(a.contextName)
	if err != nil {
		return err
	}
	a.target = selected
	var options []connect.ClientOption
	if profile := selected.Target.AuthProfile; profile != "" {
		if err := contexts.RequireSecure(selected.Target.Endpoint); err != nil {
			return err
		}
		a.tokens = &cliauth.Source{Store: a.credentialStore(), Profile: profile}
		options = append(options, connect.WithInterceptors(bearerInterceptor{tokens: *a.tokens}))
	}
	a.functions = functionsv1connect.NewFunctionsServiceClient(http.DefaultClient, selected.Target.Endpoint, options...)
	return nil
}

// authorize adds the context's bearer token, if it has credentials.
func (a *cliApp) authorize(ctx context.Context, header http.Header) error {
	if a.tokens == nil {
		return nil
	}
	return authorize(ctx, *a.tokens, header)
}

// authorize sets a bearer token minted from tokens.
func authorize(ctx context.Context, tokens cliauth.Source, header http.Header) error {
	token, err := tokens.Token(ctx)
	if err != nil {
		return err
	}
	setBearer(header, token)
	return nil
}

func setBearer(header http.Header, token string) {
	header.Set("Authorization", "Bearer "+token)
}

// bearerInterceptor authenticates every RPC in one place.
type bearerInterceptor struct {
	tokens cliauth.Source
}

func (i bearerInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if err := authorize(ctx, i.tokens, req.Header()); err != nil {
			return nil, err
		}
		resp, err := next(ctx, req)
		if connect.CodeOf(err) != connect.CodeUnauthenticated {
			return resp, err
		}
		// A cached token the server no longer accepts is minted once more.
		if err := i.tokens.Invalidate(); err != nil {
			return nil, err
		}
		if err := authorize(ctx, i.tokens, req.Header()); err != nil {
			return nil, err
		}
		return next(ctx, req)
	}
}

func (i bearerInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return func(ctx context.Context, spec connect.Spec) connect.StreamingClientConn {
		conn := next(ctx, spec)
		return &streamConn{StreamingClientConn: conn, tokens: i.tokens, err: authorize(ctx, i.tokens, conn.RequestHeader())}
	}
}

func (i bearerInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}

// streamConn surfaces a token failure from the first Send or Receive.
type streamConn struct {
	connect.StreamingClientConn
	tokens cliauth.Source
	err    error
}

func (c *streamConn) Send(message any) error {
	if c.err != nil {
		return c.err
	}
	return c.StreamingClientConn.Send(message)
}

func (c *streamConn) Receive(message any) error {
	if c.err != nil {
		return c.err
	}
	err := c.StreamingClientConn.Receive(message)
	// A stream cannot be replayed, so a rejected token is dropped for the next attempt.
	if connect.CodeOf(err) == connect.CodeUnauthenticated {
		if dropErr := c.tokens.Invalidate(); dropErr != nil {
			return errors.Join(err, dropErr)
		}
	}
	return err
}
