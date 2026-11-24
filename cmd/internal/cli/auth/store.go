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
	return s.update(func(profiles map[string]Profile) bool {
		profiles[name] = profile
		return true
	})
}

// Delete removes a profile. Deleting an absent profile is not an error.
func (s Store) Delete(name string) error {
	return s.update(func(profiles map[string]Profile) bool {
		_, stored := profiles[name]
		delete(profiles, name)
		return stored
	})
}

// SaveCache keeps a token minted with used, unless the profile's credentials have changed since.
func (s Store) SaveCache(name string, used Profile, cache Cache) error {
	return s.update(func(profiles map[string]Profile) bool {
		profile, stored := profiles[name]
		if !stored || !profile.sameCredentials(used) {
			return false
		}
		profile.Cache = &cache
		profiles[name] = profile
		return true
	})
}

// ClearCache drops a profile's cached token so the next Token call mints.
func (s Store) ClearCache(name string) error {
	return s.update(func(profiles map[string]Profile) bool {
		profile, stored := profiles[name]
		if !stored || profile.Cache == nil {
			return false
		}
		profile.Cache = nil
		profiles[name] = profile
		return true
	})
}

func (p Profile) sameCredentials(other Profile) bool {
	return p.Server == other.Server && p.ClientID == other.ClientID && p.ClientSecret == other.ClientSecret
}

// update changes the stored profiles under a lock and saves them when change reports a change.
func (s Store) update(change func(profiles map[string]Profile) bool) error {
	var doc Document
	return configfile.Update(s.Path, &doc, func() (bool, error) {
		if doc.Profiles == nil {
			doc.Profiles = map[string]Profile{}
		}
		return change(doc.Profiles), nil
	})
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
