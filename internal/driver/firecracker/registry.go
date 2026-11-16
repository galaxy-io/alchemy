package firecracker

import (
	"fmt"
	"path"
)

// registryAllowed reports whether images may come from reg, a registry
// host with its port, under allow. An empty allow admits any registry.
func registryAllowed(allow []string, reg string) bool {
	if len(allow) == 0 {
		return true
	}
	for _, pattern := range allow {
		if ok, _ := path.Match(pattern, reg); ok {
			return true
		}
	}
	return false
}

// checkRegistryAllow rejects patterns path.Match cannot use.
func checkRegistryAllow(allow []string) error {
	for _, pattern := range allow {
		if _, err := path.Match(pattern, ""); err != nil {
			return fmt.Errorf("REGISTRY_ALLOW %q: %w", pattern, err)
		}
	}
	return nil
}
