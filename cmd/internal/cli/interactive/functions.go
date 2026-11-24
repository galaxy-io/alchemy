package interactive

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	"github.com/atterpac/dado/inline"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/text"
)

const (
	actionInvoke      = "invoke"
	actionView        = "view"
	actionInvocations = "invocations"

	inputField       = "input"
	inputPlaceholder = `{"key": "value"}`
)

// browseFunctions lists functions and runs open on the chosen one, once or until backed out of.
func (r *Renderer) browseFunctions(ctx context.Context, title string, open func(context.Context, *functionsv1.Function) error, once bool) error {
	return browse(ctx, r, browser[*functionsv1.Function]{
		title: r.titled(title), loading: "Loading functions…", empty: "No functions yet.",
		columns: text.FunctionMenuColumns(), rows: text.FunctionMenuRows,
		fetch: r.listFunctions, id: (*functionsv1.Function).GetId,
		open: open, once: once,
	})
}

func (r *Renderer) listFunctions(ctx context.Context, cursor string) ([]*functionsv1.Function, *functionsv1.PaginationResponse, error) {
	res, err := r.functions.ListFunctions(ctx, connect.NewRequest(&functionsv1.ListFunctionsRequest{Pagination: r.page(cursor)}))
	if err != nil {
		return nil, nil, err
	}
	return res.Msg.GetFunctions(), res.Msg.GetPagination(), nil
}

func (r *Renderer) manageFunction(ctx context.Context, function *functionsv1.Function) error {
	action, err := r.choose(ctx, function.GetName(), function.GetId(), []option{
		{label: "Invoke", value: actionInvoke},
		{label: "View", value: actionView},
		{label: "Invocations", value: actionInvocations},
	})
	if err != nil {
		return err
	}
	switch action {
	case actionInvoke:
		return r.invokeFunction(ctx, function)
	case actionView:
		_, err := r.detail(ctx, function.GetName(), text.FunctionPairs(function), []option{{label: "Done", value: back}})
		return err
	case actionInvocations:
		return r.browseInvocations(ctx, function)
	default:
		return nil
	}
}

// invokeFunction asks for JSON input, runs the function and leaves the result in scrollback.
func (r *Renderer) invokeFunction(ctx context.Context, function *functionsv1.Function) error {
	name := function.GetName()
	if function.GetCurrentVersion().GetSpec().GetContract().GetArrow() != nil {
		return fmt.Errorf("%s has an Arrow contract; run alchemy invoke %s --arrow --file PATH", name, function.GetId())
	}
	field := inline.NewTextField(inputField, "Input").SetPlaceholder(inputPlaceholder).Required().Validate(func(value string) error {
		if !json.Valid([]byte(value)) {
			return errors.New("input must be JSON")
		}
		return nil
	})
	result, err := r.runForm(ctx, inline.NewForm("").SetHeader(r.header("Invoke "+name, nil, true)).Add(field))
	if err != nil {
		return err
	}
	input, _ := result[inputField].(string)
	var response *functionsv1.InvokeResponse
	if err := r.loading("Invoking "+name+"…", func() error {
		res, err := r.functions.Invoke(ctx, connect.NewRequest(&functionsv1.InvokeRequest{FunctionId: function.GetId(), Input: []byte(input)}))
		if err == nil {
			response = res.Msg
		}
		return err
	}); err != nil {
		return err
	}
	return r.reportInvocation(name, response)
}

func (r *Renderer) reportInvocation(name string, response *functionsv1.InvokeResponse) error {
	failed := response.GetError() != nil
	body, outcome := prettyJSON(response.GetOutput()), "succeeded"
	if failed {
		body, outcome = response.GetError().GetMessage(), "failed"
	}
	title := r.paint.Title("Invoked", name) + " " + r.paint.Muted("["+text.Duration(response.GetStats())+"]")
	if err := r.transcript(title, body); err != nil {
		return err
	}
	r.notice(!failed, fmt.Sprintf("Invocation %s %s", response.GetInvocationId(), outcome))
	return nil
}
