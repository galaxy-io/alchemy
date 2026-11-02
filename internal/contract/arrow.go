package contract

import (
	"bytes"
	"errors"
	"fmt"
	"io"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/ipc"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

// arrowContract passes IPC bytes through unchanged once they are checked.
type arrowContract struct {
	input  *arrow.Schema
	output *arrow.Schema
}

func compileArrow(c *functionsv1.ArrowContract) (*arrowContract, error) {
	in, err := parseSchema(c.GetInputSchema())
	if err != nil {
		return nil, fmt.Errorf("arrow.input_schema: %w", err)
	}
	out, err := parseSchema(c.GetOutputSchema())
	if err != nil {
		return nil, fmt.Errorf("arrow.output_schema: %w", err)
	}
	return &arrowContract{input: in, output: out}, nil
}

// newReader reads an IPC stream no part of which can declare more bytes
// than the whole stream holds. Arrow allocates what a message declares
// before reading it, so a few hostile bytes could otherwise make it allocate
// hundreds of MiB.
func newReader(raw []byte) (*ipc.Reader, error) {
	limit := max(int64(len(raw)), 1)
	return ipc.NewReader(bytes.NewReader(raw), ipc.WithMetadataSizeLimit(limit), ipc.WithBodySizeLimit(limit))
}

func parseSchema(raw []byte) (*arrow.Schema, error) {
	if len(raw) == 0 {
		return nil, errors.New("schema is required")
	}
	r, err := newReader(raw)
	if err != nil {
		return nil, fmt.Errorf("not an Arrow IPC schema: %w", err)
	}
	defer r.Release()
	s := r.Schema()
	if s.NumFields() == 0 {
		return nil, errors.New("schema has no fields")
	}
	return s, nil
}

func (c *arrowContract) EncodeInput(in []byte) (*Input, []*functionsv1.ContractViolation, error) {
	rows, violations := readBatch(in, c.input, "input")
	if violations != nil {
		return nil, violations, nil
	}
	return &Input{Wire: in, Rows: rows}, nil, nil
}

func (c *arrowContract) DecodeOutput(in *Input, out []byte) ([]byte, []*functionsv1.ContractViolation, error) {
	rows, violations := readBatch(out, c.output, "output")
	if violations != nil {
		return nil, violations, nil
	}
	if rows != in.Rows {
		return nil, []*functionsv1.ContractViolation{
			violation("", "rows", "output has %d rows; the input had %d and the output must be row-aligned", rows, in.Rows),
		}, nil
	}
	return out, nil, nil
}

// readBatch checks that raw is an IPC stream holding exactly one record batch
// whose schema matches want, and returns the batch's row count.
func readBatch(raw []byte, want *arrow.Schema, side string) (int64, []*functionsv1.ContractViolation) {
	r, err := newReader(raw)
	if err != nil {
		return 0, []*functionsv1.ContractViolation{violation("", "", "%s is not an Arrow IPC stream: %v", side, err)}
	}
	defer r.Release()
	if violations := matchSchema(r.Schema(), want); violations != nil {
		return 0, violations
	}

	if !r.Next() {
		if err := r.Err(); err != nil && !errors.Is(err, io.EOF) {
			return 0, []*functionsv1.ContractViolation{violation("", "", "%s: %v", side, err)}
		}
		return 0, []*functionsv1.ContractViolation{violation("", "", "%s stream holds no record batch", side)}
	}
	rows := r.RecordBatch().NumRows()
	if r.Next() {
		return 0, []*functionsv1.ContractViolation{violation("", "", "%s stream holds more than one record batch", side)}
	}
	if err := r.Err(); err != nil && !errors.Is(err, io.EOF) {
		return 0, []*functionsv1.ContractViolation{violation("", "", "%s: %v", side, err)}
	}
	return rows, nil
}

// matchSchema compares got against want field by field: names and types
// must be equal, and a nullable column is only allowed where the contract
// says so. Metadata is ignored.
func matchSchema(got, want *arrow.Schema) []*functionsv1.ContractViolation {
	var violations []*functionsv1.ContractViolation
	if got.NumFields() != want.NumFields() {
		violations = append(violations, violation("", "fields", "schema has %d fields, want %d", got.NumFields(), want.NumFields()))
	}
	for i := range min(got.NumFields(), want.NumFields()) {
		g, w := got.Field(i), want.Field(i)
		path := "/" + w.Name
		switch {
		case g.Name != w.Name:
			violations = append(violations, violation(path, "name", "field %d is named %q, want %q", i, g.Name, w.Name))
		case !typeEqual(g.Type, w.Type):
			violations = append(violations, violation(path, "type", "field %q has type %s, want %s", w.Name, g.Type, w.Type))
		case g.Nullable && !w.Nullable:
			violations = append(violations, violation(path, "nullable", "field %q is nullable, but the contract does not allow nulls", w.Name))
		}
	}
	return violations
}

// typeEqual compares types structurally. For list-like types the child
// field's name and nullability are ignored, because Arrow libraries disagree
// on their defaults ("item" versus "element", nullable or not) for the same
// logical type.
func typeEqual(a, b arrow.DataType) bool {
	if a.ID() != b.ID() {
		return false
	}
	switch a := a.(type) {
	case *arrow.FixedSizeListType:
		b := b.(*arrow.FixedSizeListType)
		return a.Len() == b.Len() && typeEqual(a.Elem(), b.Elem())
	case arrow.ListLikeType:
		return typeEqual(a.Elem(), b.(arrow.ListLikeType).Elem())
	default:
		return arrow.TypeEqual(a, b)
	}
}
