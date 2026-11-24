package main

import (
	"errors"
	"fmt"

	"github.com/spf13/cobra"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

const defaultPageSize int32 = 25

// listPageFlags are the paging flags every list command shares.
type listPageFlags struct {
	limit int32
	next  string
}

func (f *listPageFlags) add(command *cobra.Command) {
	command.Flags().Int32Var(&f.limit, "limit", defaultPageSize, "Number of items to show")
	command.Flags().StringVar(&f.next, "next", "", "Show the page after this `CURSOR`")
}

func (f listPageFlags) request() (*functionsv1.PaginationRequest, error) {
	if f.limit <= 0 {
		return nil, errors.New("--limit must be a positive integer")
	}
	request := &functionsv1.PaginationRequest{PageSize: f.limit}
	if f.next != "" {
		request.Cursor = &f.next
	}
	return request, nil
}

// continuation is command with the page size it ran with, for the next-page hint.
func (f listPageFlags) continuation(command string) string {
	if f.limit == defaultPageSize {
		return command
	}
	return fmt.Sprintf("%s --limit %d", command, f.limit)
}
