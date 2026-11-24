package main

import (
	"errors"
	"fmt"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/galaxy-io/alchemy/cmd/internal/cli/contexts"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/text"
)

func (a *cliApp) contextCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "context [name]",
		Aliases: []string{"ctx"},
		Short:   "Manage contexts",
		Long: `Manage contexts.

A context names a server. Credentials are stored separately.
Use --context NAME to select a context for one invocation.`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			if len(args) == 1 {
				return a.useContext(args[0])
			}
			return a.printCurrentContext()
		},
	}
	cmd.AddCommand(
		a.contextAddCommand(),
		&cobra.Command{
			Use:     "list",
			Aliases: []string{"ls"},
			Short:   "List contexts",
			Args:    cobra.NoArgs,
			RunE: func(*cobra.Command, []string) error {
				return a.listContexts()
			},
		},
		&cobra.Command{
			Use:   "current",
			Short: "Print the current context",
			Args:  cobra.NoArgs,
			RunE: func(*cobra.Command, []string) error {
				return a.printCurrentContext()
			},
		},
		&cobra.Command{
			Use:   "use <name>",
			Short: "Switch the current context",
			Args:  cobra.ExactArgs(1),
			RunE: func(_ *cobra.Command, args []string) error {
				return a.useContext(args[0])
			},
		},
		&cobra.Command{
			Use:   "rename <name> <new-name>",
			Short: "Rename a context",
			Args:  cobra.ExactArgs(2),
			RunE: func(_ *cobra.Command, args []string) error {
				if err := a.contextRegistry().Rename(args[0], args[1]); err != nil {
					return err
				}
				return printSuccess(a.statusWriter(), fmt.Sprintf("Renamed context %s to %s", args[0], args[1]))
			},
		},
		&cobra.Command{
			Use:   "delete <name>",
			Short: "Delete a context",
			Args:  cobra.ExactArgs(1),
			RunE: func(_ *cobra.Command, args []string) error {
				return a.deleteContext(args[0])
			},
		},
	)
	return cmd
}

func (a *cliApp) useContext(name string) error {
	selected, err := a.contextRegistry().Use(name)
	if err != nil {
		return err
	}
	return printSuccess(a.statusWriter(), "Switched to context "+selected.Name)
}

func (a *cliApp) printCurrentContext() error {
	current, err := a.contextRegistry().Resolve(a.contextName)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(a.stdout, current.Name)
	return err
}

// deleteContext removes a context and any credentials only it used.
func (a *cliApp) deleteContext(name string) error {
	registry := a.contextRegistry()
	target, err := registry.Resolve(name)
	if err != nil {
		return err
	}
	if err := registry.Delete(name); err != nil {
		return err
	}
	if err := a.removeUnusedProfile(registry, target.Target.AuthProfile); err != nil {
		return fmt.Errorf("deleted context %s, but %w", name, err)
	}
	return printSuccess(a.statusWriter(), "Deleted context "+name)
}

// removeUnusedProfile deletes stored credentials once no context references them.
func (a *cliApp) removeUnusedProfile(registry *contexts.Registry, profile string) error {
	if profile == "" || a.profileInUse(registry, profile) {
		return nil
	}
	if err := a.credentialStore().Delete(profile); err != nil {
		return fmt.Errorf("removing auth profile %s: %w", profile, err)
	}
	return nil
}

func (a *cliApp) profileInUse(registry *contexts.Registry, profile string) bool {
	remaining, err := registry.List()
	if err != nil {
		return true
	}
	for _, item := range remaining {
		if item.Target.AuthProfile == profile {
			return true
		}
	}
	return false
}

func (a *cliApp) listContexts() error {
	registry := a.contextRegistry()
	items, err := registry.List()
	if err != nil {
		return err
	}
	selected := ""
	if a.contextName != "" {
		effective, err := registry.Resolve(a.contextName)
		if err != nil {
			return err
		}
		selected = effective.Name
	}
	rows := make([]text.Context, 0, len(items))
	for _, item := range items {
		current := item.Current
		if selected != "" {
			current = item.Name == selected
		}
		rows = append(rows, text.Context{
			Name: item.Name, Current: current, Server: item.Target.Endpoint, LoggedIn: item.Target.AuthProfile != "",
		})
	}
	return a.text().Contexts(rows, filepath.Base(a.contextPath))
}

func (a *cliApp) contextAddCommand() *cobra.Command {
	var endpoint, authProfile string
	var force bool
	add := &cobra.Command{
		Use:   "add <name>",
		Short: "Add a context for a server",
		Args:  cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			return a.addContext(args[0], contexts.Target{Endpoint: endpoint, AuthProfile: authProfile}, force)
		},
	}
	add.Flags().StringVar(&endpoint, "server", "", "Alchemy server `URL`")
	add.Flags().StringVar(&authProfile, "auth-profile", "", "Stored authentication profile `NAME`")
	add.Flags().BoolVar(&force, "force", false, "Replace an existing context without confirmation")
	_ = add.MarkFlagRequired("server")
	return add
}

func (a *cliApp) addContext(name string, target contexts.Target, force bool) error {
	if target.AuthProfile != "" {
		if _, err := a.credentialStore().Get(target.AuthProfile); err != nil {
			return err
		}
	}
	registry := a.contextRegistry()
	existing, err := registry.Resolve(name)
	replacing := err == nil
	if replacing && !force {
		confirmed, err := a.confirm(fmt.Sprintf("Context %q already exists (%s); replace it?", name, existing.Target.Endpoint))
		if err != nil || !confirmed {
			return err
		}
	}
	if err := registry.Set(name, target); err != nil {
		return err
	}
	if !replacing {
		return printSuccess(a.statusWriter(), "Added context "+name)
	}
	if existing.Target.AuthProfile != target.AuthProfile {
		if err := a.removeUnusedProfile(registry, existing.Target.AuthProfile); err != nil {
			return errors.Join(fmt.Errorf("replaced context %s", name), err)
		}
	}
	return printSuccess(a.statusWriter(), "Replaced context "+name)
}
