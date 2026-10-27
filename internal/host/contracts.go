package host

import (
	"crypto/sha256"
	"sync"

	"google.golang.org/protobuf/proto"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/internal/contract"
)

// contractCache keeps every contract this host has compiled, keyed by the
// contract's bytes, so an artifact's contract is compiled once however many
// invocations carry it.
type contractCache struct {
	mu       sync.Mutex
	compiled map[[sha256.Size]byte]contract.Contract
}

func newContractCache() *contractCache {
	return &contractCache{compiled: make(map[[sha256.Size]byte]contract.Contract)}
}

// get returns the compiled form of c.
func (cc *contractCache) get(c *functionsv1.Contract) (contract.Contract, error) {
	data, err := proto.MarshalOptions{Deterministic: true}.Marshal(c)
	if err != nil {
		return nil, err
	}
	key := sha256.Sum256(data)
	cc.mu.Lock()
	defer cc.mu.Unlock()
	if compiled, ok := cc.compiled[key]; ok {
		return compiled, nil
	}
	compiled, err := contract.Compile(c)
	if err != nil {
		return nil, err
	}
	cc.compiled[key] = compiled
	return compiled, nil
}
