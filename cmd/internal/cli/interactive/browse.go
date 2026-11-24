package interactive

import (
	"context"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/style"
)

const (
	pagePrevious = "__previous__"
	pageNext     = "__next__"
)

// browser describes one paged collection and what opening an item does.
type browser[T any] struct {
	title   string
	loading string
	empty   string
	columns []style.Column
	fetch   func(ctx context.Context, cursor string) ([]T, *functionsv1.PaginationResponse, error)
	rows    func([]T) [][]string
	id      func(T) string
	open    func(context.Context, T) error
	// once returns after the first opened item instead of listing again.
	once bool
}

// browse pages through a collection and opens the chosen items until backed out of.
func browse[T any](ctx context.Context, r *Renderer, b browser[T]) error {
	cursor := ""
	for {
		var items []T
		var page *functionsv1.PaginationResponse
		if err := r.loading(b.loading, func() (err error) {
			items, page, err = b.fetch(ctx, cursor)
			return err
		}); err != nil {
			return err
		}
		byID := make(map[string]T, len(items))
		ids := make([]string, 0, len(items))
		for _, item := range items {
			byID[b.id(item)] = item
			ids = append(ids, b.id(item))
		}
		var table []option
		if len(items) > 0 {
			table = r.tableMenu(b.columns, b.rows(items), ids)
		}
		selected, err := r.pick(ctx, b.title, b.empty, table, page)
		if err != nil || selected == back {
			return err
		}
		if next, turned := turn(selected, page); turned {
			cursor = next
			continue
		}
		err = b.open(ctx, byID[selected])
		if interrupted(err) || (b.once && !cancelled(err)) {
			return err
		}
		r.report(err)
	}
}

// pick shows one page's table with its paging actions, or empty when the page has no rows.
func (r *Renderer) pick(ctx context.Context, title, empty string, table []option, page *functionsv1.PaginationResponse) (string, error) {
	description := ""
	if len(table) == 0 {
		description = empty
	}
	options := table
	previous, next := page.GetPreviousCursor(), page.GetNextCursor()
	if len(table) > 0 && (previous != "" || next != "") {
		options = append(options, spacer)
	}
	if previous != "" {
		options = append(options, option{label: "Previous page", value: pagePrevious})
	}
	if next != "" {
		options = append(options, option{label: "Next page", value: pageNext})
	}
	if len(options) == 0 {
		options = append(options, option{label: "Done", value: back})
	}
	selected, err := r.choose(ctx, title, description, options)
	// An interrupt also reads as a cancel, so it is checked first.
	if interrupted(err) {
		return "", err
	}
	if cancelled(err) {
		return back, nil
	}
	return selected, err
}

// turn follows a paging action to its cursor.
func turn(selected string, page *functionsv1.PaginationResponse) (string, bool) {
	switch selected {
	case pagePrevious:
		return page.GetPreviousCursor(), true
	case pageNext:
		return page.GetNextCursor(), true
	default:
		return "", false
	}
}

// page requests one page starting at cursor.
func (r *Renderer) page(cursor string) *functionsv1.PaginationRequest {
	request := &functionsv1.PaginationRequest{PageSize: r.pageSize}
	if cursor != "" {
		request.Cursor = &cursor
	}
	return request
}
