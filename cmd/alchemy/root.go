package main

import (
	"fmt"
	"strings"
	"text/template"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	"github.com/galaxy-io/alchemy/cmd/internal/cli/interactive"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/style"
	"github.com/galaxy-io/alchemy/internal/version"
)

func init() {
	cobra.EnableCommandSorting = false
	cobra.EnableTraverseRunHooks = true
}

func (a *cliApp) rootCommand() *cobra.Command {
	root := &cobra.Command{
		Use:               "alchemy",
		Long:              "Alchemy runs fast, isolated, strongly typed functions.",
		Version:           version.String(),
		SilenceUsage:      true,
		SilenceErrors:     true,
		Args:              cobra.NoArgs,
		PersistentPreRunE: a.prepare,
		RunE:              a.menu(interactive.SectionMenu),
	}
	root.SetIn(a.stdin)
	root.SetOut(a.stdout)
	root.SetErr(a.statusWriter())

	root.PersistentFlags().StringVar(&a.contextName, "context", "", "Run against context `NAME`")
	root.PersistentFlags().BoolVarP(&a.menuMode, "interactive", "i", false, "Open the interactive menu")
	root.PersistentFlags().StringVar(&a.layoutName, layoutFlag, style.LayoutBoxed.String(), "Draw tables as `boxed` or plain (also "+layoutEnv+")")
	root.SetVersionTemplate("alchemy {{.Version}}\n")

	a.installHelpStyle(root)
	root.AddCommand(
		a.functionCommand(),
		a.invokeCommand(),
		a.invocationCommand(),
		a.statusCommand(),
		a.contextCommand(),
		a.authCommand(),
		a.versionCommand(),
	)
	return root
}

func (a *cliApp) prepareTarget(*cobra.Command, []string) error {
	return a.dial()
}

// targetGroup makes group's subcommands run against the selected context and lets the group itself open its menu or print help.
func (a *cliApp) targetGroup(group *cobra.Command, section interactive.Section) *cobra.Command {
	group.RunE = a.menu(section)
	group.PersistentPreRunE = func(cmd *cobra.Command, args []string) error {
		if cmd == group {
			return nil
		}
		return a.prepareTarget(cmd, args)
	}
	return group
}

const usageTemplate = `{{heading "Usage:"}}{{if and .Runnable (not .HasAvailableSubCommands)}}
  {{useLine .}}{{end}}{{if .HasAvailableSubCommands}}
  {{literal .CommandPath}} {{muted "[command]"}}{{end}}{{if .HasAvailableSubCommands}}

{{heading "Available Commands:"}}{{range .Commands}}{{if (or .IsAvailableCommand (eq .Name "help"))}}
  {{literal (rpad .Name .NamePadding)}} {{.Short}}{{end}}{{end}}{{end}}{{if .HasAvailableLocalFlags}}

{{heading "Flags:"}}
{{flagUsages .LocalFlags}}{{end}}{{if .HasAvailableInheritedFlags}}

{{heading "Global Flags:"}}
{{flagUsages .InheritedFlags}}{{end}}{{if .HasAvailableSubCommands}}

{{muted (printf "Use \"%s [command] --help\" for more information about a command." .CommandPath)}}{{end}}
`

// installHelpStyle colours cobra's help: headings, literals, placeholders.
func (a *cliApp) installHelpStyle(root *cobra.Command) {
	p := style.New(a.stdout)
	funcs := template.FuncMap{
		"heading": p.Bold,
		"literal": p.Accent,
		"muted":   p.Muted,
		"rpad":    func(text string, width int) string { return fmt.Sprintf("%-*s", width, text) },
		"useLine": func(cmd *cobra.Command) string {
			path := cmd.CommandPath()
			return p.Accent(path) + p.Muted(strings.TrimPrefix(cmd.UseLine(), path))
		},
		"flagUsages": func(flags *pflag.FlagSet) string { return flagUsages(p, flags) },
	}
	usage := template.Must(template.New("usage").Funcs(funcs).Parse(usageTemplate))
	root.SetUsageFunc(func(cmd *cobra.Command) error {
		return usage.Execute(cmd.OutOrStdout(), cmd)
	})
}

// flagRow is one help line: the flag plain for measuring, painted for printing.
type flagRow struct {
	plain, painted, usage string
}

func flagUsages(p style.Painter, flags *pflag.FlagSet) string {
	rows := []flagRow{}
	flags.VisitAll(func(flag *pflag.Flag) {
		if flag.Hidden {
			return
		}
		placeholder, usage := pflag.UnquoteUsage(flag)
		short, name := "    ", "--"+flag.Name
		if flag.Shorthand != "" {
			short = "-" + flag.Shorthand + ", "
		}
		plain, painted := short+name, short+p.Accent(name)
		if placeholder != "" {
			plain += " " + placeholder
			painted += " " + p.Muted(placeholder)
		}
		if flag.DefValue != "" && flag.DefValue != "false" && flag.DefValue != "0" && flag.DefValue != "[]" {
			usage += " " + p.Muted("(default "+flag.DefValue+")")
		}
		rows = append(rows, flagRow{plain: plain, painted: painted, usage: usage})
	})
	width := 0
	for _, row := range rows {
		width = max(width, len(row.plain))
	}
	var out strings.Builder
	for _, row := range rows {
		fmt.Fprintf(&out, "  %s%s   %s\n", row.painted, strings.Repeat(" ", width-len(row.plain)), row.usage)
	}
	return strings.TrimRight(out.String(), "\n")
}
