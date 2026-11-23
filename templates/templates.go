// Package templates serves the templates a function can be built from. Each is a
// directory holding a template.json and a handler.py per contract kind.
package templates

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"strconv"
	"time"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/ipc"
	"google.golang.org/protobuf/types/known/structpb"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

// files holds each template's directory.
//
//go:embed */template.json */*/handler.py
var files embed.FS

const (
	runtime      = "python"
	manifestPath = "template.json"
	handlerPath  = "handler.py"
	// retries is 0: every call a template makes is paid, so a failure is not replayed.
	retries = 0
	// lockupURL is where the logo and name of the service the templates call are served.
	lockupURL = "https://cdn.getgalaxy.io/integrations/integration-lockup-openrouter"
)

// manifest is a template's template.json.
type manifest struct {
	Label       string            `json:"label"`
	Description string            `json:"description"`
	Timeout     string            `json:"timeout"`
	Env         map[string]string `json:"env"`
	Secrets     []string          `json:"secrets"`
	Contract    struct {
		JSONSchema struct {
			Input  map[string]any `json:"input"`
			Output map[string]any `json:"output"`
		} `json:"json_schema"`
		Arrow struct {
			Input  []arrowField `json:"input"`
			Output []arrowField `json:"output"`
		} `json:"arrow"`
	} `json:"contract"`
}

// arrowField is an Arrow field with its type as a pyarrow token, e.g. list<utf8>.
type arrowField struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Nullable bool   `json:"nullable"`
}

// List reads every template, in id order.
func List() ([]*functionsv1.Template, error) {
	manifests, err := fs.Glob(files, path.Join("*", manifestPath))
	if err != nil {
		return nil, err
	}
	out := make([]*functionsv1.Template, 0, len(manifests))
	for _, p := range manifests {
		id := path.Dir(p)
		t, err := load(id)
		if err != nil {
			return nil, fmt.Errorf("template %s: %w", id, err)
		}
		out = append(out, t)
	}
	return out, nil
}

func load(id string) (*functionsv1.Template, error) {
	raw, err := files.ReadFile(path.Join(id, manifestPath))
	if err != nil {
		return nil, err
	}
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	timeout, err := time.ParseDuration(m.Timeout)
	if err != nil {
		return nil, fmt.Errorf("timeout: %w", err)
	}
	jsonSource, err := jsonSource(id, m)
	if err != nil {
		return nil, err
	}
	arrowSource, err := arrowSource(id, m)
	if err != nil {
		return nil, err
	}
	return &functionsv1.Template{
		Id:             id,
		Label:          m.Label,
		Description:    m.Description,
		Runtime:        runtime,
		JsonSchema:     jsonSource,
		Arrow:          arrowSource,
		Env:            m.Env,
		Secrets:        m.Secrets,
		Network:        functionsv1.Network_NETWORK_EGRESS,
		DarkLockupUrl:  lockupURL + "-dark.svg",
		LightLockupUrl: lockupURL + "-light.svg",
		TimeoutMs:      timeout.Milliseconds(),
		Retries:        retries,
	}, nil
}

func jsonSource(id string, m manifest) (*functionsv1.TemplateSource, error) {
	input, err := structpb.NewStruct(m.Contract.JSONSchema.Input)
	if err != nil {
		return nil, err
	}
	output, err := structpb.NewStruct(m.Contract.JSONSchema.Output)
	if err != nil {
		return nil, err
	}
	return source(id, "json_schema", &functionsv1.Contract{Kind: &functionsv1.Contract_JsonSchema{
		JsonSchema: &functionsv1.JsonSchemaContract{Input: input, Output: output},
	}})
}

func arrowSource(id string, m manifest) (*functionsv1.TemplateSource, error) {
	input, err := arrowSchema(m.Contract.Arrow.Input)
	if err != nil {
		return nil, err
	}
	output, err := arrowSchema(m.Contract.Arrow.Output)
	if err != nil {
		return nil, err
	}
	return source(id, "arrow", &functionsv1.Contract{Kind: &functionsv1.Contract_Arrow{
		Arrow: &functionsv1.ArrowContract{InputSchema: input, OutputSchema: output},
	}})
}

// source pairs the handler for a contract kind with its sample contract.
func source(id, kind string, contract *functionsv1.Contract) (*functionsv1.TemplateSource, error) {
	handler, err := files.ReadFile(path.Join(id, kind, handlerPath))
	if err != nil {
		return nil, err
	}
	return &functionsv1.TemplateSource{
		Files:    []*functionsv1.SourceFile{{Path: handlerPath, Content: handler, Size: int64(len(handler))}},
		Contract: contract,
	}, nil
}

// arrowSchema serializes fields as an IPC stream holding only the schema.
func arrowSchema(fields []arrowField) ([]byte, error) {
	out := make([]arrow.Field, 0, len(fields))
	for _, f := range fields {
		t, err := arrowType(f.Type)
		if err != nil {
			return nil, fmt.Errorf("field %s: %w", f.Name, err)
		}
		out = append(out, arrow.Field{Name: f.Name, Type: t, Nullable: f.Nullable})
	}
	var buf bytes.Buffer
	w := ipc.NewWriter(&buf, ipc.WithSchema(arrow.NewSchema(out, nil)))
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

var (
	listToken          = regexp.MustCompile(`^list<(.+)>$`)
	fixedSizeListToken = regexp.MustCompile(`^fixed_size_list<(.+)>\[(\d+)\]$`)
	primitiveTokens    = map[string]arrow.DataType{
		"utf8":    arrow.BinaryTypes.String,
		"bool":    arrow.FixedWidthTypes.Boolean,
		"int32":   arrow.PrimitiveTypes.Int32,
		"int64":   arrow.PrimitiveTypes.Int64,
		"float32": arrow.PrimitiveTypes.Float32,
		"float64": arrow.PrimitiveTypes.Float64,
	}
)

// arrowType parses the pyarrow tokens the web UI uses for the types templates need.
func arrowType(token string) (arrow.DataType, error) {
	if m := listToken.FindStringSubmatch(token); m != nil {
		item, err := arrowType(m[1])
		if err != nil {
			return nil, err
		}
		return arrow.ListOf(item), nil
	}
	if m := fixedSizeListToken.FindStringSubmatch(token); m != nil {
		item, err := arrowType(m[1])
		if err != nil {
			return nil, err
		}
		size, err := strconv.ParseInt(m[2], 10, 32)
		if err != nil {
			return nil, err
		}
		return arrow.FixedSizeListOf(int32(size), item), nil
	}
	if t, ok := primitiveTokens[token]; ok {
		return t, nil
	}
	return nil, fmt.Errorf("unsupported arrow type %q", token)
}
