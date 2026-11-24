package interactive

import (
	"context"

	"github.com/galaxy-io/alchemy/cmd/internal/cli/style"
)

const currentMark = "current"

// manageSettings edits the user's CLI preferences and saves them.
func (r *Renderer) manageSettings(ctx context.Context) error {
	options := make([]option, 0, len(layouts))
	for _, layout := range layouts {
		item := option{label: layout.label, value: layout.layout.String()}
		if layout.layout == r.layout {
			item.description = currentMark
		}
		options = append(options, item)
	}
	selected, err := r.choose(ctx, r.titled("Settings"), "Table layout", options)
	if err != nil {
		return err
	}
	layout, err := style.ParseLayout(selected)
	if err != nil {
		return err
	}
	if err := r.saveLayout(layout); err != nil {
		r.notice(false, "Unable to save settings: "+err.Error())
		return nil
	}
	r.layout = layout
	r.notice(true, "Layout set to "+selected)
	return nil
}

var layouts = []struct {
	label  string
	layout style.Layout
}{
	{"Boxed", style.LayoutBoxed},
	{"Plain", style.LayoutPlain},
}
