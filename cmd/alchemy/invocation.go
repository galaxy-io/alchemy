package main

import (
	"connectrpc.com/connect"
	"github.com/spf13/cobra"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/interactive"
)

const allFunctions = "all functions"

func (a *cliApp) invocationCommand() *cobra.Command {
	cmd := a.targetGroup(&cobra.Command{
		Use:   "invocation",
		Short: "Inspect invocations and their logs",
		Args:  cobra.NoArgs,
	}, interactive.SectionInvocations)
	cmd.AddCommand(a.invocationListCommand(), a.invocationGetCommand(), a.invocationLogsCommand())
	return cmd
}

func (a *cliApp) invocationListCommand() *cobra.Command {
	var page listPageFlags
	cmd := &cobra.Command{
		Use:     "list [function]",
		Aliases: []string{"ls"},
		Short:   "List past invocations",
		Args:    cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			pagination, err := page.request()
			if err != nil {
				return err
			}
			request := &functionsv1.ListInvocationsRequest{Pagination: pagination}
			subject, command := allFunctions, "alchemy invocation list"
			if len(args) == 1 {
				request.FunctionIds = args
				subject, command = args[0], command+" "+args[0]
			}
			res, err := a.functions.ListInvocations(cmd.Context(), connect.NewRequest(request))
			if err != nil {
				return err
			}
			return a.text().Invocations(res.Msg.GetInvocations(), res.Msg.GetPagination(), subject, command)
		},
	}
	page.add(cmd)
	return cmd
}

func (a *cliApp) invocationGetCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "get <invocation>",
		Short: "Show an invocation",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			res, err := a.functions.GetInvocation(cmd.Context(), connect.NewRequest(&functionsv1.GetInvocationRequest{Id: args[0]}))
			if err != nil {
				return err
			}
			return a.text().Invocation(res.Msg.GetInvocation())
		},
	}
}

func (a *cliApp) invocationLogsCommand() *cobra.Command {
	var follow bool
	cmd := &cobra.Command{
		Use:   "logs <invocation>",
		Short: "Print an invocation's logs",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			stream, err := a.functions.GetInvocationLogs(cmd.Context(), connect.NewRequest(&functionsv1.GetInvocationLogsRequest{Id: args[0], Follow: follow}))
			if err != nil {
				return err
			}
			defer func() { _ = stream.Close() }()
			for stream.Receive() {
				if _, err := a.stdout.Write(stream.Msg().GetData()); err != nil {
					return err
				}
			}
			return stream.Err()
		},
	}
	cmd.Flags().BoolVar(&follow, "follow", false, "Keep printing until the invocation ends")
	return cmd
}
