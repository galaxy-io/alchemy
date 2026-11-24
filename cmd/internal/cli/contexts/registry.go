// Package contexts manages the named servers the CLI runs against.
package contexts

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"

	"github.com/galaxy-io/alchemy/cmd/internal/cli/configfile"
)

const (
	// DefaultName is the built-in context, a server on this machine.
	DefaultName = "local"
	// DefaultEndpoint is where the built-in context points.
	DefaultEndpoint = "http://localhost:8780"
)

var namePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

// Target is one server. AuthProfile is a credential-store key, never a token.
type Target struct {
	Endpoint    string `yaml:"endpoint"`
	AuthProfile string `yaml:"auth_profile,omitempty"`
}

// NamedTarget associates a target with its context name and selection state.
type NamedTarget struct {
	Name    string
	Current bool
	Target  Target
}

// Document is the persisted, secret-free context registry.
type Document struct {
	Current  string            `yaml:"current"`
	Contexts map[string]Target `yaml:"contexts"`
}

// Store atomically persists a context registry.
type Store struct {
	Path string
}

// Registry resolves and changes contexts, with the built-in one always present.
type Registry struct {
	store Store
}

// NewRegistry constructs a registry over store.
func NewRegistry(store Store) *Registry {
	return &Registry{store: store}
}

// List returns all configured contexts sorted by name.
func (r *Registry) List() ([]NamedTarget, error) {
	doc, err := r.load()
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(doc.Contexts))
	for name := range doc.Contexts {
		names = append(names, name)
	}
	sort.Strings(names)
	result := make([]NamedTarget, 0, len(names))
	for _, name := range names {
		result = append(result, NamedTarget{Name: name, Current: name == doc.Current, Target: doc.Contexts[name]})
	}
	return result, nil
}

// Resolve returns the named context, or the current one when name is empty.
func (r *Registry) Resolve(name string) (NamedTarget, error) {
	doc, err := r.load()
	if err != nil {
		return NamedTarget{}, err
	}
	if name == "" {
		name = doc.Current
	}
	target, ok := doc.Contexts[name]
	if !ok {
		return NamedTarget{}, fmt.Errorf("context %q does not exist", name)
	}
	return NamedTarget{Name: name, Current: name == doc.Current, Target: target}, nil
}

// Set validates and upserts a context without changing the selection.
func (r *Registry) Set(name string, target Target) error {
	if err := validate(name, target); err != nil {
		return err
	}
	doc, err := r.load()
	if err != nil {
		return err
	}
	doc.Contexts[name] = target
	return r.store.Write(doc)
}

// SetAndUse persists a context and selects it in one file replacement.
func (r *Registry) SetAndUse(name string, target Target) (NamedTarget, error) {
	if err := validate(name, target); err != nil {
		return NamedTarget{}, err
	}
	doc, err := r.load()
	if err != nil {
		return NamedTarget{}, err
	}
	doc.Contexts[name] = target
	doc.Current = name
	if err := r.store.Write(doc); err != nil {
		return NamedTarget{}, err
	}
	return NamedTarget{Name: name, Current: true, Target: target}, nil
}

// Rename moves a context to a new name, carrying the selection with it.
func (r *Registry) Rename(oldName, newName string) error {
	doc, err := r.load()
	if err != nil {
		return err
	}
	target, ok := doc.Contexts[oldName]
	if !ok {
		return fmt.Errorf("context %q does not exist", oldName)
	}
	if oldName == DefaultName {
		return fmt.Errorf("the built-in %s context cannot be renamed", DefaultName)
	}
	if _, exists := doc.Contexts[newName]; exists {
		return fmt.Errorf("context %q already exists", newName)
	}
	if err := validate(newName, target); err != nil {
		return err
	}
	delete(doc.Contexts, oldName)
	doc.Contexts[newName] = target
	if doc.Current == oldName {
		doc.Current = newName
	}
	return r.store.Write(doc)
}

// Delete removes a context, except the built-in one and the current one.
func (r *Registry) Delete(name string) error {
	doc, err := r.load()
	if err != nil {
		return err
	}
	if _, ok := doc.Contexts[name]; !ok {
		return fmt.Errorf("context %q does not exist", name)
	}
	if name == DefaultName {
		return fmt.Errorf("the built-in %s context cannot be deleted", DefaultName)
	}
	if doc.Current == name {
		return fmt.Errorf("context %q is the current context; switch away from it first", name)
	}
	delete(doc.Contexts, name)
	return r.store.Write(doc)
}

// Use persists name as the active context.
func (r *Registry) Use(name string) (NamedTarget, error) {
	doc, err := r.load()
	if err != nil {
		return NamedTarget{}, err
	}
	target, ok := doc.Contexts[name]
	if !ok {
		return NamedTarget{}, fmt.Errorf("context %q does not exist", name)
	}
	doc.Current = name
	if err := r.store.Write(doc); err != nil {
		return NamedTarget{}, err
	}
	return NamedTarget{Name: name, Current: true, Target: target}, nil
}

func (r *Registry) load() (Document, error) {
	doc, err := r.store.Load()
	if err != nil {
		return Document{}, err
	}
	if _, exists := doc.Contexts[DefaultName]; !exists {
		doc.Contexts[DefaultName] = Target{Endpoint: DefaultEndpoint}
	}
	if doc.Current == "" {
		doc.Current = DefaultName
	}
	for name, target := range doc.Contexts {
		if err := validate(name, target); err != nil {
			return Document{}, err
		}
	}
	if _, exists := doc.Contexts[doc.Current]; !exists {
		return Document{}, fmt.Errorf("current context %q does not exist", doc.Current)
	}
	return doc, nil
}

// Load reads the context document. A missing file is an empty registry.
func (s Store) Load() (Document, error) {
	var doc Document
	if err := configfile.Load(s.Path, &doc); err != nil {
		return Document{}, err
	}
	if doc.Contexts == nil {
		doc.Contexts = map[string]Target{}
	}
	return doc, nil
}

// Write atomically replaces the context document with owner-only permissions.
func (s Store) Write(doc Document) error {
	return configfile.Save(s.Path, doc)
}

func validate(name string, target Target) error {
	if !namePattern.MatchString(name) {
		return fmt.Errorf("context name %q must match %s", name, namePattern)
	}
	if err := ValidateEndpoint(target.Endpoint); err != nil {
		return fmt.Errorf("context %q: %w", name, err)
	}
	return nil
}

// ValidateEndpoint accepts an absolute HTTP or HTTPS URL.
func ValidateEndpoint(endpoint string) error {
	parsed, err := url.ParseRequestURI(endpoint)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("server must be an absolute HTTP(S) URL")
	}
	return nil
}
