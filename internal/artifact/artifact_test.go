package artifact

import (
	"testing"

	"google.golang.org/protobuf/proto"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
)

func base() *hostv1.Artifact {
	return &hostv1.Artifact{
		TenantId:   "00000000-0000-0000-0000-000000000001",
		FunctionId: "00000000-0000-0000-0000-000000000002",
		Version:    1,
		Digest:     "sha256:abc",
		WorkingDir: "/app",
		Vcpus:      1,
		MemoryMib:  128,
		Argv:       []string{"python", "handler.py"},
		Env:        map[string]string{"A": "1", "B": "2"},
		Layers:     []*hostv1.Layer{{Sha256: "l1"}},
		Secrets:    map[string]string{"TOKEN": "api-token"},
	}
}

func TestIDChangesWithEachInput(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*hostv1.Artifact)
	}{
		{"tenant", func(a *hostv1.Artifact) { a.TenantId = "00000000-0000-0000-0000-000000000009" }},
		{"function", func(a *hostv1.Artifact) { a.FunctionId = "00000000-0000-0000-0000-000000000009" }},
		{"version", func(a *hostv1.Artifact) { a.Version = 2 }},
		{"digest", func(a *hostv1.Artifact) { a.Digest = "sha256:def" }},
		{"working dir", func(a *hostv1.Artifact) { a.WorkingDir = "/srv" }},
		{"vcpus", func(a *hostv1.Artifact) { a.Vcpus = 2 }},
		{"memory", func(a *hostv1.Artifact) { a.MemoryMib = 256 }},
		{"argv", func(a *hostv1.Artifact) { a.Argv = []string{"python", "main.py"} }},
		{"env value", func(a *hostv1.Artifact) { a.Env["A"] = "9" }},
		{"layer", func(a *hostv1.Artifact) { a.Layers = append(a.Layers, &hostv1.Layer{Sha256: "l2"}) }},
		{"secret name", func(a *hostv1.Artifact) { a.Secrets = map[string]string{"OTHER": "api-token"} }},
		// Without separators these two would hash the same.
		{"argv split", func(a *hostv1.Artifact) { a.Argv = []string{"pythonhandler.py"} }},
		{"argv into env", func(a *hostv1.Artifact) { a.Argv = append(a.Argv, "A=1"); delete(a.Env, "A") }},
	}
	want := ID(base())
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := base()
			tt.mutate(a)
			if got := ID(a); got == want {
				t.Errorf("ID unchanged after changing %s", tt.name)
			}
		})
	}
}

func TestIDIgnoresMapOrderAndTheIDField(t *testing.T) {
	a := base()
	b := base()
	// Rebuild the maps so their iteration order is independent of a's.
	b.Env = map[string]string{"B": "2", "A": "1"}
	b.Secrets = map[string]string{"TOKEN": "api-token"}
	b.Id = "stale"
	for range 20 {
		if ID(a) != ID(b) {
			t.Fatal("equal artifacts named differently")
		}
	}
	if got := ID(a); len(got) != 32 {
		t.Errorf("ID length = %d, want 32", len(got))
	}
}

func TestIDDoesNotModifyArtifact(t *testing.T) {
	a := base()
	before := proto.Clone(a)
	ID(a)
	if !proto.Equal(a, before) {
		t.Error("ID modified its argument")
	}
}
