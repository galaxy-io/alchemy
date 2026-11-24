package main

import (
	"fmt"
	"os"
	"path/filepath"
)

const (
	configDirName   = "alchemy"
	contextsFile    = "contexts.yaml"
	credentialsFile = "credentials.yaml"
	settingsFile    = "settings.yaml"
)

func defaultContextPath() (string, error) {
	if root := os.Getenv("XDG_CONFIG_HOME"); root != "" {
		return filepath.Join(root, configDirName, contextsFile), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(home, ".config", configDirName, contextsFile), nil
}

func (a *cliApp) settingsPath() string {
	return filepath.Join(filepath.Dir(a.contextPath), settingsFile)
}

func (a *cliApp) credentialsPath() string {
	return filepath.Join(filepath.Dir(a.contextPath), credentialsFile)
}
