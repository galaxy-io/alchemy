// Package runtimes is the catalog of images a function built from source
// lands on: one per language, built from runtimes/ at the repository root
// and published under one registry prefix.
package runtimes

import (
	"embed"
	"path"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

// starters are the handlers a function starts from, named
// <id>.<contract kind>.<extension>. Go starters end in .go.tmpl, so they are
// not part of this module.
//
//go:embed starters/*
var starters embed.FS

// Runtime is one entry of the catalog.
type Runtime struct {
	ID    string
	Label string
	Tag   string // the image under the prefix, e.g. python:3.13
	// BuildTag, when set, is the image under the prefix that compiles a
	// source before it lands on Tag, e.g. go:1.27-build.
	BuildTag    string
	HandlerPath string
	starter     string // the starter file's extension
}

// All lists the runtimes a source can be built on. The static runtime is
// not among them: it runs a binary built elsewhere.
var All = []Runtime{
	{ID: "python", Label: "Python 3.13", Tag: "python:3.13", HandlerPath: "handler.py", starter: "py"},
	{ID: "node", Label: "Node 24", Tag: "node:24", HandlerPath: "handler.ts", starter: "ts"},
	{ID: "go", Label: "Go 1.27", Tag: "go:1.27", BuildTag: "go:1.27-build", HandlerPath: "main.go", starter: "go.tmpl"},
	{ID: "rust", Label: "Rust 1.99", Tag: "rust:1.99", BuildTag: "rust:1.99-build", HandlerPath: "main.rs", starter: "rs"},
}

// BuildImage is the image that compiles a source landing on image, when
// image is a runtime under imagePrefix that needs one, and "" otherwise.
func BuildImage(imagePrefix, image string) string {
	for _, r := range All {
		if r.BuildTag != "" && image == imagePrefix+"/"+r.Tag {
			return imagePrefix + "/" + r.BuildTag
		}
	}
	return ""
}

// List is the catalog in wire form: images under imagePrefix and icons
// under iconBaseURL, named runtime-icon-<id>-<dark|light>.svg.
func List(imagePrefix, iconBaseURL string) []*functionsv1.Runtime {
	out := make([]*functionsv1.Runtime, 0, len(All))
	for _, r := range All {
		out = append(out, &functionsv1.Runtime{
			Id:           r.ID,
			Label:        r.Label,
			Image:        imagePrefix + "/" + r.Tag,
			HandlerPath:  r.HandlerPath,
			DarkIconUrl:  iconBaseURL + "/runtime-icon-" + r.ID + "-dark.svg",
			LightIconUrl: iconBaseURL + "/runtime-icon-" + r.ID + "-light.svg",
			Starters: &functionsv1.RuntimeStarters{
				JsonSchema: r.starterFor("json_schema"),
				Arrow:      r.starterFor("arrow"),
			},
		})
	}
	return out
}

func (r Runtime) starterFor(kind string) string {
	b, err := starters.ReadFile(path.Join("starters", r.ID+"."+kind+"."+r.starter))
	if err != nil {
		panic("runtimes: missing starter for " + r.ID + " " + kind)
	}
	return string(b)
}
