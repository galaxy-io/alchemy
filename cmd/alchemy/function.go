package main

import (
	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/interactive"
)

func (a *cliApp) functionCommand() *cobra.Command {
	cmd := a.targetGroup(&cobra.Command{
		Use:   "function",
		Short: "Inspect functions",
		Args:  cobra.NoArgs,
	}, interactive.SectionFunctions)
	cmd.AddCommand(a.functionListCommand(), a.functionGetCommand())
	return cmd
}

func (a *cliApp) functionListCommand() *cobra.Command {
	var page listPageFlags
	cmd := &cobra.Command{
		Use:     "list",
		Aliases: []string{"ls"},
		Short:   "List functions",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			pagination, err := page.request()
			if err != nil {
				return err
			}
			res, err := a.functions.ListFunctions(cmd.Context(), connect.NewRequest(&functionsv1.ListFunctionsRequest{Pagination: pagination}))
			if err != nil {
				return err
			}
			return a.text().Functions(res.Msg.GetFunctions(), res.Msg.GetPagination(), a.target.Name, page.continuation(a.commandLine("function list")))
		},
	}
	page.add(cmd)
	return cmd
}

func (a *cliApp) functionGetCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "get <function>",
		Short: "Show a function and its versions",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			res, err := a.functions.GetFunction(cmd.Context(), connect.NewRequest(&functionsv1.GetFunctionRequest{Id: args[0], IncludeVersions: true}))
			if err != nil {
				return err
			}
			return a.text().Function(res.Msg.GetFunction())
		},
	}
}
