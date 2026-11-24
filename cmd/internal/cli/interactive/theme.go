package interactive

import (
	"github.com/atterpac/dado/inline"
	"github.com/gdamore/tcell/v2"

	"github.com/galaxy-io/alchemy/cmd/internal/cli/style"
)

// alchemyTheme has one accent, with tints that follow the terminal background.
func alchemyTheme(dark bool) inline.InlineTheme {
	colors := style.Palette(dark)
	muted := tcell.StyleDefault.Foreground(tcell.NewHexColor(colors.Muted))

	theme := inline.RoundedInlineTheme()
	theme.Accent = tcell.StyleDefault.Foreground(tcell.NewHexColor(colors.Accent))
	theme.Label = tcell.StyleDefault.Foreground(tcell.NewHexColor(colors.Label))
	theme.Muted = muted
	theme.Success = tcell.StyleDefault.Foreground(tcell.NewHexColor(colors.Success))
	theme.Error = tcell.StyleDefault.Foreground(tcell.NewHexColor(colors.Error))
	theme.Border = tcell.StyleDefault
	theme.FocusedBorder = tcell.StyleDefault
	theme.Borders = inline.BorderSet{TopLeft: " ", TopRight: " ", BottomLeft: " ", BottomRight: " ", Horizontal: " ", Vertical: " "}
	theme.FieldGap = 0
	theme.Glyphs.Focus = "▸"
	theme.Glyphs.Required = ""
	theme.Glyphs.Checked = "✓"
	theme.Glyphs.Unchecked = "○"
	theme.Glyphs.Success = "✓"
	theme.Status.PendingStyle = muted
	theme.Status.ActiveStyle = tcell.StyleDefault.Bold(true)
	theme.Status.SuccessStyle = tcell.StyleDefault
	theme.Status.PendingMarker = "○"
	theme.Status.ActiveMarker = "●"
	theme.Status.SuccessMarker = "✓"
	return theme
}
