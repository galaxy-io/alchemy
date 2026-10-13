// Package contract compiles and enforces a function version's I/O boundary.
//
// Payloads are opaque bytes to the rest of the platform. A Contract is the
// one place that knows what they are (a JSON value, an Arrow record batch)
// and checks them on the way in and on the way out.
package contract

import (
	"errors"
	"fmt"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

// Input is a checked input, ready for the function process.
type Input struct {
	// Wire is what the function receives on stdin.
	Wire []byte
	// Rows is the batch's row count for Arrow contracts, -1 otherwise.
	Rows int64
}

// Contract enforces one version's boundary. Violations are the counterparty's
// fault (the caller's on input, the function's on output); a non-nil error is
// the platform's.
type Contract interface {
	// EncodeInput checks a caller's input and returns what the function
	// receives.
	EncodeInput(in []byte) (*Input, []*functionsv1.ContractViolation, error)
	// DecodeOutput checks what the function wrote to stdout, given the input
	// it was handed, and returns the bytes to send back to the caller.
	DecodeOutput(in *Input, out []byte) ([]byte, []*functionsv1.ContractViolation, error)
}

// Compile validates and compiles c.
func Compile(c *functionsv1.Contract) (Contract, error) {
	switch kind := c.GetKind().(type) {
	case *functionsv1.Contract_JsonSchema:
		return compileJSONSchema(kind.JsonSchema)
	case *functionsv1.Contract_Arrow:
		return compileArrow(kind.Arrow)
	case nil:
		return nil, errors.New("contract is required")
	default:
		return nil, fmt.Errorf("unsupported contract kind %T", kind)
	}
}

func violation(instancePath, schemaPath, format string, args ...any) *functionsv1.ContractViolation {
	return &functionsv1.ContractViolation{
		InstancePath: instancePath,
		SchemaPath:   schemaPath,
		Message:      fmt.Sprintf(format, args...),
	}
}
