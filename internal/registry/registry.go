// Package registry finds credentials for pulling function images. Each cloud
// is a Provider; registries no provider claims use the Docker config
// ($DOCKER_CONFIG) or are pulled anonymously.
package registry

import "github.com/google/go-containerregistry/pkg/authn"

// Provider authenticates pulls from one cloud's registries. It resolves
// registries that aren't its own to authn.Anonymous.
type Provider interface {
	authn.Keychain
}

// Keychain resolves credentials from the Docker config first, so explicit
// credentials win, then from the first provider that claims the registry.
func Keychain(providers ...Provider) authn.Keychain {
	chain := make([]authn.Keychain, 0, 1+len(providers))
	chain = append(chain, authn.DefaultKeychain)
	for _, p := range providers {
		chain = append(chain, p)
	}
	return authn.NewMultiKeychain(chain...)
}
