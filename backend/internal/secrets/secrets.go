package secrets

import (
	"fmt"
	"os"
)

type SecretType int

const (
	Clerk SecretType = iota
)

type Secrets struct {
	SecretKey string
}

type SecretManager interface {
	GetSecret(key SecretType) (string, error)
}

func NewSecretManager(keyMap map[SecretType]string) SecretManager {
	return &secretManagerImpl{
		keyMap: keyMap,
	}
}

type secretManagerImpl struct {
	keyMap map[SecretType]string
}

func (s *secretManagerImpl) GetSecret(keyType SecretType) (string, error) {
	if k := os.Getenv(s.keyMap[keyType]); k != "" {
		return k, nil
	}
	return "", fmt.Errorf("secret not found: %s", s.keyMap[keyType])
}
