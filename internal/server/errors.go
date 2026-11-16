package server

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgconn"
)

// PostgreSQL error codes the server acts on.
const (
	pgUniqueViolation   = "23505"
	pgInvalidTextFormat = "22P02"
)

// errNotFound answers an id the database cannot parse, which names nothing.
var errNotFound = connect.NewError(connect.CodeNotFound, errors.New("not found"))

// ErrorInterceptor answers an id that is not a uuid with NOT_FOUND, instead
// of an internal error carrying the database's message.
type ErrorInterceptor struct{}

// WrapUnary maps a unary RPC's error.
func (ErrorInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		resp, err := next(ctx, req)
		return resp, publicError(err)
	}
}

// WrapStreamingClient leaves client streams alone; the server has none.
func (ErrorInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

// WrapStreamingHandler maps a streaming RPC's error.
func (ErrorInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		return publicError(next(ctx, conn))
	}
}

func publicError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgInvalidTextFormat {
		return errNotFound
	}
	return err
}
