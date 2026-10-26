package contract

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"google.golang.org/protobuf/types/known/structpb"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

// jsonSchemaContract passes JSON through unchanged on both sides.
type jsonSchemaContract struct {
	input  *jsonschema.Schema
	output *jsonschema.Schema
}

func compileJSONSchema(c *functionsv1.JsonSchemaContract) (*jsonSchemaContract, error) {
	in, err := compileSchema(c.GetInput())
	if err != nil {
		return nil, fmt.Errorf("json_schema.input: %w", err)
	}
	out, err := compileSchema(c.GetOutput())
	if err != nil {
		return nil, fmt.Errorf("json_schema.output: %w", err)
	}
	return &jsonSchemaContract{input: in, output: out}, nil
}

func compileSchema(doc *structpb.Struct) (*jsonschema.Schema, error) {
	if doc == nil {
		return nil, errors.New("schema is required")
	}
	c := jsonschema.NewCompiler()
	c.UseLoader(noExternalRefs{})
	const root = "mem:///schema.json"
	if err := c.AddResource(root, doc.AsMap()); err != nil {
		return nil, err
	}
	return c.Compile(root)
}

func (c *jsonSchemaContract) EncodeInput(in []byte) (*Input, []*functionsv1.ContractViolation, error) {
	var v any
	if err := json.Unmarshal(in, &v); err != nil {
		return nil, []*functionsv1.ContractViolation{{Message: fmt.Sprintf("input is not a JSON value: %v", err)}}, nil
	}
	if violations := validate(c.input, v); violations != nil {
		return nil, violations, nil
	}
	return &Input{Wire: in, Rows: -1}, nil, nil
}

func (c *jsonSchemaContract) DecodeOutput(_ *Input, out []byte) ([]byte, []*functionsv1.ContractViolation, error) {
	var v any
	if err := json.Unmarshal(out, &v); err != nil {
		return nil, []*functionsv1.ContractViolation{{Message: fmt.Sprintf("output is not a JSON value: %v", err)}}, nil
	}
	if violations := validate(c.output, v); violations != nil {
		return nil, violations, nil
	}
	return out, nil, nil
}

// validate returns one violation per failed keyword, or nil.
func validate(s *jsonschema.Schema, v any) []*functionsv1.ContractViolation {
	err := s.Validate(v)
	if err == nil {
		return nil
	}
	var verr *jsonschema.ValidationError
	if !errors.As(err, &verr) {
		return []*functionsv1.ContractViolation{{Message: err.Error()}}
	}
	out := verr.BasicOutput()
	violations := make([]*functionsv1.ContractViolation, 0, len(out.Errors))
	for _, unit := range out.Errors {
		if unit.Error == nil {
			continue
		}
		violations = append(violations, &functionsv1.ContractViolation{
			InstancePath: unit.InstanceLocation,
			SchemaPath:   unit.KeywordLocation,
			Message:      unit.Error.String(),
		})
	}
	if len(violations) == 0 {
		violations = append(violations, &functionsv1.ContractViolation{Message: verr.Error()})
	}
	return violations
}

// noExternalRefs makes schemas self-contained: any $ref that leaves the
// document fails compilation instead of reading a file or URL.
type noExternalRefs struct{}

func (noExternalRefs) Load(url string) (any, error) {
	return nil, fmt.Errorf("external $ref %q is not allowed", url)
}
