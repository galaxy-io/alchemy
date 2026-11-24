package interactive

import (
	"bytes"
	"context"
	"encoding/json"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/text"
)

const (
	actionLogs = "logs"
	jsonIndent = "  "
)

// browseInvocations lists invocations, of one function when given, and opens the chosen one.
func (r *Renderer) browseInvocations(ctx context.Context, function *functionsv1.Function) error {
	title := "Invocations"
	var names map[string]string
	request := &functionsv1.ListInvocationsRequest{}
	if function != nil {
		title = "Invocations of " + function.GetName()
		names = map[string]string{function.GetId(): function.GetName()}
		request.FunctionIds = []string{function.GetId()}
	}
	return browse(ctx, r, browser[*functionsv1.Invocation]{
		title: r.titled(title), loading: "Loading invocations…", empty: "No invocations yet.",
		columns: text.InvocationColumns(),
		rows: func(invocations []*functionsv1.Invocation) [][]string {
			return text.InvocationMenuRows(invocations, names)
		},
		fetch: func(ctx context.Context, cursor string) ([]*functionsv1.Invocation, *functionsv1.PaginationResponse, error) {
			if names == nil {
				names = r.functionNames(ctx)
			}
			request.Pagination = r.page(cursor)
			res, err := r.functions.ListInvocations(ctx, connect.NewRequest(request))
			if err != nil {
				return nil, nil, err
			}
			return res.Msg.GetInvocations(), res.Msg.GetPagination(), nil
		},
		id:   (*functionsv1.Invocation).GetId,
		open: r.manageInvocation,
	})
}

// functionNames names the first page of functions by id. The table shows ids for the rest.
func (r *Renderer) functionNames(ctx context.Context) map[string]string {
	names := map[string]string{}
	functions, _, err := r.listFunctions(ctx, "")
	if err != nil {
		return names
	}
	for _, function := range functions {
		names[function.GetId()] = function.GetName()
	}
	return names
}

func (r *Renderer) manageInvocation(ctx context.Context, invocation *functionsv1.Invocation) error {
	for {
		action, err := r.detail(ctx, "Invocation", text.InvocationPairs(invocation), []option{
			{label: "Logs", value: actionLogs},
			{label: "Done", value: back},
		})
		if err != nil || action != actionLogs {
			return err
		}
		if err := r.printLogs(ctx, invocation.GetId()); err != nil {
			return err
		}
	}
}

// printLogs leaves an invocation's logs in scrollback.
func (r *Renderer) printLogs(ctx context.Context, id string) error {
	var logs bytes.Buffer
	if err := r.loading("Loading logs…", func() error {
		stream, err := r.functions.GetInvocationLogs(ctx, connect.NewRequest(&functionsv1.GetInvocationLogsRequest{Id: id}))
		if err != nil {
			return err
		}
		defer func() { _ = stream.Close() }()
		for stream.Receive() {
			logs.Write(stream.Msg().GetData())
		}
		return stream.Err()
	}); err != nil {
		return err
	}
	if logs.Len() == 0 {
		r.notice(true, "No logs for this invocation")
		return nil
	}
	return r.transcript(r.paint.Title("Logs of", id), logs.String())
}

// prettyJSON indents JSON output and leaves anything else as it is.
func prettyJSON(output []byte) string {
	var indented bytes.Buffer
	if err := json.Indent(&indented, output, "", jsonIndent); err != nil {
		return string(output)
	}
	return indented.String()
}
