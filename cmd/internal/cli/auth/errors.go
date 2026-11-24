package auth

import "errors"

// Sentinel errors, worded for a terminal. Callers match with errors.Is.
var (
	// ErrProfileNotFound: no stored profile under that name. Login fixes it.
	ErrProfileNotFound = errors.New("no stored credentials")
	// ErrProfileInvalid: a profile lacks a field needed to mint a token.
	ErrProfileInvalid = errors.New("credentials are incomplete")
	// ErrAuthServerUnreachable: the server could not mint a token.
	ErrAuthServerUnreachable = errors.New("server could not issue a token")
	// ErrTokenRejected: the server refused the client id and secret.
	ErrTokenRejected = errors.New("client id or secret was not accepted")
)
