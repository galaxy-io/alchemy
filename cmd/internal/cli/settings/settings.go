// Package settings persists CLI preferences that belong to the user.
package settings

import "github.com/galaxy-io/alchemy/cmd/internal/cli/configfile"

// Settings is the persisted preference file.
type Settings struct {
	// Layout draws tables and menus boxed or plain.
	Layout string `yaml:"layout,omitempty"`
}

// Load reads the settings at path. A missing file is empty settings.
func Load(path string) (Settings, error) {
	var out Settings
	if err := configfile.Load(path, &out); err != nil {
		return Settings{}, err
	}
	return out, nil
}

// Save writes the settings at path.
func Save(path string, s Settings) error {
	return configfile.Save(path, s)
}
