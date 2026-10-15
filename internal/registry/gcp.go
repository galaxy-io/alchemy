package registry

import "github.com/google/go-containerregistry/pkg/v1/google"

// GCP authenticates to Artifact Registry and Container Registry with
// Application Default Credentials: Workload Identity or the node's service
// account.
func GCP() Provider {
	return google.Keychain
}
