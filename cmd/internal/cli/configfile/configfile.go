// Package configfile reads and atomically writes the CLI's owner-only YAML files.
package configfile

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"syscall"

	"gopkg.in/yaml.v3"
)

const (
	dirMode    = 0o700
	fileMode   = 0o600
	yamlIndent = 2
	lockSuffix = ".lock"
)

// ErrMalformed marks a file that exists but does not parse.
var ErrMalformed = errors.New("cannot parse")

// Load decodes the file at path into out, rejecting unknown fields. A missing or empty file leaves out as it is.
func Load(path string, out any) error {
	data, err := os.ReadFile(path) //nolint:gosec // the CLI names its own config files
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(out); err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("%w %s: %w", ErrMalformed, path, err)
	}
	return nil
}

// Update loads the file at path into doc and saves it when change reports a change. A lock keeps other CLI runs from interleaving.
func Update(path string, doc any, change func() (bool, error)) error {
	if err := os.MkdirAll(filepath.Dir(path), dirMode); err != nil {
		return fmt.Errorf("create %s: %w", filepath.Dir(path), err)
	}
	// The lock is a sidecar file, because Save replaces the file itself.
	lock, err := os.OpenFile(path+lockSuffix, os.O_CREATE|os.O_RDWR, fileMode) //nolint:gosec // the CLI names its own config files
	if err != nil {
		return fmt.Errorf("lock %s: %w", path, err)
	}
	defer func() { _ = lock.Close() }()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil { //nolint:gosec // a file descriptor fits an int
		return fmt.Errorf("lock %s: %w", path, err)
	}
	if err := Load(path, doc); err != nil {
		return err
	}
	changed, err := change()
	if err != nil || !changed {
		return err
	}
	return Save(path, doc)
}

// Save atomically replaces the file at path with doc, readable by its owner only.
func Save(path string, doc any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, dirMode); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+"-*")
	if err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	committed := false
	defer func() {
		_ = tmp.Close()
		if !committed {
			_ = os.Remove(tmp.Name())
		}
	}()
	if err := write(tmp, doc); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	committed = true
	return nil
}

func write(file *os.File, doc any) error {
	if err := file.Chmod(fileMode); err != nil {
		return err
	}
	encoder := yaml.NewEncoder(file)
	encoder.SetIndent(yamlIndent)
	if err := encoder.Encode(doc); err != nil {
		return err
	}
	if err := encoder.Close(); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	return file.Close()
}
