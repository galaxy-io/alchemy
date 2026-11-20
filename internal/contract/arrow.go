package contract

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"strings"

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
// says so. Metadata is ignored, except a canonical extension type's name.
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
		case !fieldTypeEqual(g, w):
			violations = append(violations, violation(path, "type", "field %q has type %s, want %s", w.Name, fieldType(g), fieldType(w)))
		case g.Nullable && !w.Nullable:
			violations = append(violations, violation(path, "nullable", "field %q is nullable, but the contract does not allow nulls", w.Name))
		}
	}
	return violations
}

// extensionNameKey is the field metadata key naming an extension type, such as arrow.json.
const extensionNameKey = "ARROW:extension:name"

func extensionName(f arrow.Field) string {
	if i := f.Metadata.FindKey(extensionNameKey); i >= 0 {
		return f.Metadata.Values()[i]
	}
	return ""
}

// fieldType names f's type, or its extension type when it has one.
func fieldType(f arrow.Field) string {
	if name := extensionName(f); name != "" {
		return fmt.Sprintf("%s<%s>", name, f.Type)
	}
	switch t := f.Type.(type) {
	case *arrow.FixedSizeListType:
		return fmt.Sprintf("%s<%s>[%d]", t.Name(), fieldType(t.ElemField()), t.Len())
	case *arrow.ListType, *arrow.LargeListType:
		return fmt.Sprintf("%s<%s>", t.Name(), fieldType(t.(arrow.ListLikeType).ElemField()))
	case *arrow.StructType:
		children := make([]string, t.NumFields())
		for i, c := range t.Fields() {
			children[i] = c.Name + ": " + fieldType(c)
		}
		return fmt.Sprintf("%s<%s>", t.Name(), strings.Join(children, ", "))
	}
	return f.Type.String()
}

// fieldTypeEqual compares types structurally, extension names included. For
// list-like types the child field's name and nullability are ignored, because
// Arrow libraries disagree on their defaults ("item" versus "element",
// nullable or not) for the same logical type.
func fieldTypeEqual(a, b arrow.Field) bool {
	if extensionName(a) != extensionName(b) || a.Type.ID() != b.Type.ID() {
		return false
	}
	switch t := a.Type.(type) {
	case *arrow.FixedSizeListType:
		u := b.Type.(*arrow.FixedSizeListType)
		return t.Len() == u.Len() && fieldTypeEqual(t.ElemField(), u.ElemField())
	case arrow.ListLikeType:
		return fieldTypeEqual(t.ElemField(), b.Type.(arrow.ListLikeType).ElemField())
	case *arrow.StructType:
		u := b.Type.(*arrow.StructType)
		if t.NumFields() != u.NumFields() {
			return false
		}
		for i, f := range t.Fields() {
			g := u.Field(i)
			if f.Name != g.Name || f.Nullable != g.Nullable || !fieldTypeEqual(f, g) {
				return false
			}
		}
		return true
	default:
		if !arrow.TypeEqual(a.Type, b.Type) {
			return false
		}
		// TypeEqual skips child metadata, so check the extension names of any other nested type's children.
		if n, ok := a.Type.(arrow.NestedType); ok {
			for i, f := range n.Fields() {
				if !fieldTypeEqual(f, b.Type.(arrow.NestedType).Fields()[i]) {
					return false
				}
			}
		}
		return true
	}
}
