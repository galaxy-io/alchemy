package runtimes

import (
	"io/fs"
	"path"
	"strings"
	"testing"
)

// Every runtime has a starter for each contract kind, and every starter
// file belongs to a runtime and a kind, so a renamed or misplaced file
// fails here rather than as a panic when the catalog is served.
func TestStartersMatchCatalog(t *testing.T) {
	kinds := []string{"json_schema", "arrow"}
	want := map[string]bool{}
	for _, r := range All {
		for _, kind := range kinds {
			if r.starterFor(kind) == "" {
				t.Errorf("%s %s starter is empty", r.ID, kind)
			}
			want[path.Join("starters", r.ID, kind+"."+r.starter)] = true
		}
	}
	err := fs.WalkDir(starters, "starters", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		if !want[p] {
			t.Errorf("%s is not a starter of any runtime", p)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// The Go starters must not compile as part of this module.
func TestGoStartersAreTemplates(t *testing.T) {
	entries, err := fs.ReadDir(starters, "starters/go")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".go") {
			t.Errorf("starters/go/%s would be built with the module; name it .go.tmpl", e.Name())
		}
	}
}
