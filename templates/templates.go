// Package templates is the catalog of sources to build a function from.
package templates

import (
	"bytes"
	"embed"
	"fmt"
	"path"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/ipc"
	"google.golang.org/protobuf/types/known/structpb"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

// files holds each template's handlers, at <id>/<contract kind>.py.
var files embed.FS

const (
	runtime     = "python"
	handlerPath = "handler.py"
)

// Template is one entry of the catalog.
type Template struct {
	ID          string
	Label       string
	Description string
	Env         map[string]string
	Secrets     []string
	// ComingSoon templates are listed for clients to show, with no source yet.
	ComingSoon bool
	// JSONInput and JSONOutput are the sample JSON Schema contract.
	JSONInput  map[string]any
	JSONOutput map[string]any
	// ArrowInput and ArrowOutput are the sample Arrow contract.
	ArrowInput  []arrow.Field
	ArrowOutput []arrow.Field
}

// All lists the templates, in the order a client offers them.
var All = []Template{}

// lockupURL is where the logo and name of the service the templates call are served.
const lockupURL = "https://cdn.getgalaxy.io/integrations/integration-lockup-openrouter"

// List is the catalog in wire form.
func List() ([]*functionsv1.Template, error) {
	out := make([]*functionsv1.Template, 0, len(All))
	for _, t := range All {
		wire, err := t.wire()
		if err != nil {
			return nil, fmt.Errorf("template %s: %w", t.ID, err)
		}
		out = append(out, wire)
	}
	return out, nil
}

func (t Template) wire() (*functionsv1.Template, error) {
	card := &functionsv1.Template{
		Id:             t.ID,
		Label:          t.Label,
		Description:    t.Description,
		Runtime:        runtime,
		ComingSoon:     t.ComingSoon,
		DarkLockupUrl:  lockupURL + "-dark.svg",
		LightLockupUrl: lockupURL + "-light.svg",
	}
	if t.ComingSoon {
		return card, nil
	}
	jsonSource, err := t.jsonSource()
	if err != nil {
		return nil, err
	}
	arrowSource, err := t.arrowSource()
	if err != nil {
		return nil, err
	}
	card.JsonSchema = jsonSource
	card.Arrow = arrowSource
	card.Env = t.Env
	card.Secrets = t.Secrets
	card.Network = functionsv1.Network_NETWORK_EGRESS
	return card, nil
}

func (t Template) jsonSource() (*functionsv1.TemplateSource, error) {
	input, err := structpb.NewStruct(t.JSONInput)
	if err != nil {
		return nil, err
	}
	output, err := structpb.NewStruct(t.JSONOutput)
	if err != nil {
		return nil, err
	}
	return t.source("json_schema", &functionsv1.Contract{Kind: &functionsv1.Contract_JsonSchema{
		JsonSchema: &functionsv1.JsonSchemaContract{Input: input, Output: output},
	}})
}

func (t Template) arrowSource() (*functionsv1.TemplateSource, error) {
	input, err := arrowSchema(t.ArrowInput)
	if err != nil {
		return nil, err
	}
	output, err := arrowSchema(t.ArrowOutput)
	if err != nil {
		return nil, err
	}
	return t.source("arrow", &functionsv1.Contract{Kind: &functionsv1.Contract_Arrow{
		Arrow: &functionsv1.ArrowContract{InputSchema: input, OutputSchema: output},
	}})
}

// source pairs the handler for a contract kind with its sample contract.
func (t Template) source(kind string, contract *functionsv1.Contract) (*functionsv1.TemplateSource, error) {
	handler, err := files.ReadFile(path.Join(t.ID, kind+".py"))
	if err != nil {
		return nil, err
	}
	return &functionsv1.TemplateSource{
		Files:    []*functionsv1.SourceFile{{Path: handlerPath, Content: handler, Size: int64(len(handler))}},
		Contract: contract,
	}, nil
}

// arrowSchema serializes fields as an IPC stream holding only the schema.
func arrowSchema(fields []arrow.Field) ([]byte, error) {
	var buf bytes.Buffer
	w := ipc.NewWriter(&buf, ipc.WithSchema(arrow.NewSchema(fields, nil)))
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
