package registry

import (
	"io"

	ecr "github.com/awslabs/amazon-ecr-credential-helper/ecr-login"
	"github.com/google/go-containerregistry/pkg/authn"
)

// AWS authenticates to ECR with the AWS credential chain: Pod Identity, IRSA
// or the instance role. The helper's logs are dropped: it logs an error for
// every registry that isn't ECR, and a real failure surfaces as the pull's
// 401 anyway.
func AWS() Provider {
	return authn.NewKeychainFromHelper(ecr.NewECRHelper(ecr.WithLogger(io.Discard)))
}
