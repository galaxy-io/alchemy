package templates

import (
	"testing"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/contract"
	"github.com/galaxy-io/alchemy/internal/runtimes"
)

// Every buildable template serves, names a runtime and has a handler and a
// compiling contract for each contract kind.
func TestTemplatesCompile(t *testing.T) {
	list, err := List()
	if err != nil {
		t.Fatal(err)
	}
	known := map[string]bool{}
	for _, r := range runtimes.All {
		known[r.ID] = true
	}
	for _, tmpl := range list {
		if !known[tmpl.GetRuntime()] {
			t.Errorf("%s: unknown runtime %q", tmpl.GetId(), tmpl.GetRuntime())
		}
		for _, source := range []*functionsv1.TemplateSource{tmpl.GetJsonSchema(), tmpl.GetArrow()} {
			if len(source.GetFiles()) == 0 {
				t.Errorf("%s: a contract kind has no handler", tmpl.GetId())
			}
			if _, err := contract.Compile(source.GetContract()); err != nil {
				t.Errorf("%s: %v", tmpl.GetId(), err)
			}
		}
	}
}
