package host

import (
	"context"
	"log/slog"
	"slices"
	"testing"

	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
	"github.com/galaxy-io/alchemy/internal/driver"
)

// forgetDriver records what Forget is asked to keep.
type forgetDriver struct {
	driver.Driver
	keeps [][]*driver.Artifact
}

func (d *forgetDriver) Forget(_ context.Context, _ *driver.Artifact, keep []*driver.Artifact) error {
	d.keeps = append(d.keeps, keep)
	return nil
}

func keepsLayers(keep []*driver.Artifact, layers []string) bool {
	return slices.ContainsFunc(keep, func(k *driver.Artifact) bool { return slices.Equal(k.Layers, layers) })
}

func compileHost(d driver.Driver) *Host {
	return &Host{
		driver:     d,
		log:        slog.New(slog.DiscardHandler),
		background: context.Background(),
		compiling:  make(map[string]int),
		artifacts:  make(map[string]*hostv1.Artifact),
	}
}

func TestEndCompileKeepsLayersAnotherCompileUses(t *testing.T) {
	d := &forgetDriver{}
	h := compileHost(d)
	built := &driver.Artifact{Digest: "sha256:build", Layers: []string{"source"}}

	h.beginCompile("source")
	h.beginCompile("source")
	h.endCompile("source", built)
	if len(d.keeps) != 1 || !keepsLayers(d.keeps[0], built.Layers) {
		t.Fatal("the first of two compiles of a source dropped the layer drive the other uses")
	}
	h.endCompile("source", built)
	if len(d.keeps) != 2 || keepsLayers(d.keeps[1], built.Layers) {
		t.Fatal("the last compile of a source kept its layer drive")
	}
	if len(h.compiling) != 0 {
		t.Errorf("compiling = %v, want empty", h.compiling)
	}
}

func TestEndCompileKeepsLayersAServedArtifactUses(t *testing.T) {
	d := &forgetDriver{}
	h := compileHost(d)
	h.artifacts["served"] = &hostv1.Artifact{Id: "served", Digest: "sha256:runtime", Layers: []*hostv1.Layer{{Sha256: "source"}}}
	built := &driver.Artifact{Digest: "sha256:build", Layers: []string{"source"}}

	h.beginCompile("source")
	h.endCompile("source", built)
	if len(d.keeps) != 1 || !keepsLayers(d.keeps[0], built.Layers) {
		t.Fatal("a compile dropped a layer drive a served artifact runs on")
	}
}

func TestEndCompileWithoutBuildForgetsNothing(t *testing.T) {
	d := &forgetDriver{}
	h := compileHost(d)

	h.beginCompile("source")
	h.endCompile("source", nil)
	if len(d.keeps) != 0 {
		t.Error("a compile whose build failed called Forget")
	}
	if len(h.compiling) != 0 {
		t.Errorf("compiling = %v, want empty", h.compiling)
	}
}
