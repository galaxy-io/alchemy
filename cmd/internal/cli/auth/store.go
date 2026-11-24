// Package auth stores service-account credentials and mints access tokens.
package auth

import (
	"fmt"
	"time"

	"github.com/galaxy-io/alchemy/cmd/internal/cli/configfile"
)

// Profile holds one service account's credentials and the server that redeems them.
type Profile struct {
	Server       string `yaml:"server"`
	ClientID     string `yaml:"client_id"`
	ClientSecret string `yaml:"client_secret"`
	Cache        *Cache `yaml:"cache,omitempty"`
}

// Cache is a previously minted access token retained until expiry.
type Cache struct {
	AccessToken string    `yaml:"access_token"`
	ExpiresAt   time.Time `yaml:"expires_at"`
}

// Document is the persisted credential file, keyed by auth profile name.
type Document struct {
	Profiles map[string]Profile `yaml:"profiles"`
}

// Store atomically persists credentials with owner-only permissions.
type Store struct {
	Path string
}

// Get returns a stored profile.
func (s Store) Get(name string) (Profile, error) {
	doc, err := s.Load()
	if err != nil {
		return Profile{}, err
	}
	profile, ok := doc.Profiles[name]
	if !ok {
		return Profile{}, fmt.Errorf("%w for %s", ErrProfileNotFound, name)
	}
	return profile, nil
}

// Put validates and stores a profile, replacing any under the same name.
func (s Store) Put(name string, profile Profile) error {
	if name == "" {
		return fmt.Errorf("%w: name is required", ErrProfileInvalid)
	}
	if profile.Server == "" || profile.ClientID == "" || profile.ClientSecret == "" {
		return fmt.Errorf("%w: %s needs a server, client id, and client secret", ErrProfileInvalid, name)
	}
	doc, err := s.Load()
	if err != nil {
		return err
	}
	doc.Profiles[name] = profile
	return s.Write(doc)
}

// Delete removes a profile. Deleting an absent profile is not an error.
func (s Store) Delete(name string) error {
	doc, err := s.Load()
	if err != nil {
		return err
	}
	if _, ok := doc.Profiles[name]; !ok {
		return nil
	}
	delete(doc.Profiles, name)
	return s.Write(doc)
}

// SaveCache persists a freshly minted token against an existing profile.
func (s Store) SaveCache(name string, cache Cache) error {
	return s.setCache(name, &cache)
}

// ClearCache drops a profile's cached token so the next Token call mints.
func (s Store) ClearCache(name string) error {
	return s.setCache(name, nil)
}

func (s Store) setCache(name string, cache *Cache) error {
	doc, err := s.Load()
	if err != nil {
		return err
	}
	profile, ok := doc.Profiles[name]
	if !ok {
		return fmt.Errorf("%w for %s", ErrProfileNotFound, name)
	}
	profile.Cache = cache
	doc.Profiles[name] = profile
	return s.Write(doc)
}

// Load reads the credential document. A missing file is an empty store.
func (s Store) Load() (Document, error) {
	var doc Document
	if err := configfile.Load(s.Path, &doc); err != nil {
		return Document{}, err
	}
	if doc.Profiles == nil {
		doc.Profiles = map[string]Profile{}
	}
	return doc, nil
}

// Write atomically replaces the credential document with owner-only permissions.
func (s Store) Write(doc Document) error {
	return configfile.Save(s.Path, doc)
}
