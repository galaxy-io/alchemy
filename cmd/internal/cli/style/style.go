// Package style paints CLI output with one accent and background-aware tints.
package style

import (
	"fmt"
	"image/color"
	"io"
	"os"
	"strings"
	"sync"
	"time"

	"charm.land/lipgloss/v2"
	"charm.land/lipgloss/v2/table"
	"golang.org/x/term"
)

const (
	// Indent precedes every table row.
	Indent = "  "
	// Gutter separates plain table columns.
	Gutter = 5

	cellPadding = 1
	bytesUnit   = 1024
)

// Colors is the palette for one background.
type Colors struct {
	Accent, Label, Muted, Success, Error int32

	Succeeded, Failed, Rejected, Running, Pending, Starting, Canceled int32
}

// Palette returns the tints that read on a dark or light background.
func Palette(dark bool) Colors {
	if dark {
		return Colors{
			Accent: 0x5b92e7, Label: 0xa3a3a2, Muted: 0x666665, Success: 0x6ee4b0, Error: 0xfb7185,
			Succeeded: 0x4cb782, Failed: 0xf6525c, Rejected: 0xf3a8e5, Running: 0x99cffd,
			Pending: 0xffd2a8, Starting: 0xfff7aa, Canceled: 0xacacac,
		}
	}
	return Colors{
		Accent: 0x5b92e7, Label: 0x5c5c5b, Muted: 0x8a8a89, Success: 0x1a8a5a, Error: 0xc0392b,
		Succeeded: 0x7ccfaa, Failed: 0xf65166, Rejected: 0xf77fb4, Running: 0x7dabff,
		Pending: 0xeeab72, Starting: 0xd9cf74, Canceled: 0x3f3f3f,
	}
}

// hex converts a palette entry to a lipgloss colour.
func hex(value int32) color.Color {
	return lipgloss.Color(fmt.Sprintf("#%06x", value))
}

var (
	darkOnce   sync.Once
	darkResult = true
)

// Terminal returns stream as a file when it is a terminal.
func Terminal(stream any) (*os.File, bool) {
	file, ok := stream.(*os.File)
	if !ok || !term.IsTerminal(int(file.Fd())) { //nolint:gosec // a file descriptor fits an int
		return nil, false
	}
	return file, true
}

// Dark reports whether the terminal has a dark background, assumed for non-terminals.
func Dark(in io.Reader, out io.Writer) bool {
	inFile, inOK := Terminal(in)
	outFile, outOK := Terminal(out)
	if !inOK || !outOK {
		return true
	}
	darkOnce.Do(func() { darkResult = lipgloss.HasDarkBackground(inFile, outFile) })
	return darkResult
}

// Painter styles text for one destination. The zero value paints nothing.
type Painter struct {
	enabled bool
	colors  Colors

	accent, bold, label, muted, success, failure lipgloss.Style
}

// New inspects w, NO_COLOR, and the terminal background.
func New(w io.Writer) Painter {
	file, ok := Terminal(w)
	if !ok || os.Getenv("NO_COLOR") != "" || os.Getenv("TERM") == "dumb" {
		return Painter{}
	}
	colors := Palette(Dark(os.Stdin, file))
	return Painter{
		enabled: true,
		colors:  colors,
		accent:  lipgloss.NewStyle().Foreground(hex(colors.Accent)),
		bold:    lipgloss.NewStyle().Bold(true),
		label:   lipgloss.NewStyle().Foreground(hex(colors.Label)),
		muted:   lipgloss.NewStyle().Foreground(hex(colors.Muted)),
		success: lipgloss.NewStyle().Foreground(hex(colors.Success)),
		failure: lipgloss.NewStyle().Foreground(hex(colors.Error)),
	}
}

// Accent paints text in the brand colour.
func (p Painter) Accent(text string) string { return p.accent.Render(text) }

// Bold paints headings and primary cells.
func (p Painter) Bold(text string) string { return p.bold.Render(text) }

// Label paints secondary text such as keys.
func (p Painter) Label(text string) string { return p.label.Render(text) }

// Muted paints tertiary text such as placeholders and helper lines.
func (p Painter) Muted(text string) string { return p.muted.Render(text) }

// Success paints completed states.
func (p Painter) Success(text string) string { return p.success.Render(text) }

// Error paints failures.
func (p Painter) Error(text string) string { return p.failure.Render(text) }

// Status paints text in the tone for status, e.g. the failed red.
func (p Painter) Status(status, text string) string { return p.status(status).Render(text) }

// Title renders a context line such as "> Functions on local".
func (p Painter) Title(prefix, subject string) string {
	line := p.Accent(">") + " " + prefix
	if subject != "" {
		line += " " + p.Bold(subject)
	}
	return line
}

// Role decides how a column's cells are emphasised.
type Role int

// Column roles. RoleStatus colors a "● Status" cell by what the status means.
const (
	RolePlain Role = iota
	RolePrimary
	RoleSecondary
	RoleNumber
	RoleStatus
)

// Layout is how a table is drawn.
type Layout int

// Table layouts: boxed is a ruled box, plain is a whitespace grid.
const (
	LayoutBoxed Layout = iota
	LayoutPlain
)

const (
	layoutBoxedName = "boxed"
	layoutPlainName = "plain"
)

// String names the layout the way ParseLayout reads it.
func (l Layout) String() string {
	if l == LayoutPlain {
		return layoutPlainName
	}
	return layoutBoxedName
}

// ParseLayout reads a layout name from a flag or environment value.
func ParseLayout(value string) (Layout, error) {
	switch value {
	case "", layoutBoxedName:
		return LayoutBoxed, nil
	case layoutPlainName:
		return LayoutPlain, nil
	default:
		return LayoutBoxed, fmt.Errorf("layout must be %s or %s, not %q", layoutBoxedName, layoutPlainName, value)
	}
}

// Column describes one table column.
type Column struct {
	Title string
	Role  Role
}

// Grid renders rows in the given layout.
func (p Painter) Grid(layout Layout, columns []Column, rows [][]string) string {
	if layout == LayoutPlain {
		return p.plainTable(columns, rows)
	}
	return p.boxedTable(columns, rows)
}

// Titles lists the column headings.
func Titles(columns []Column) []string {
	headers := make([]string, len(columns))
	for index, column := range columns {
		headers[index] = column.Title
	}
	return headers
}

// plainTable renders a whitespace grid with muted headers and role-styled cells.
func (p Painter) plainTable(columns []Column, rows [][]string) string {
	headers := Titles(columns)
	widths := Widths(append([][]string{headers}, rows...))
	gap := strings.Repeat(" ", Gutter)
	var out strings.Builder
	line := func(cells []string, paint func(int, string) string) {
		out.WriteString(Indent)
		for index, cell := range cells {
			out.WriteString(paint(index, cell))
			if index < len(cells)-1 {
				out.WriteString(strings.Repeat(" ", widths[index]-Width(cell)) + gap)
			}
		}
		out.WriteString("\n")
	}
	line(headers, func(_ int, text string) string { return p.muted.Render(text) })
	for _, row := range rows {
		line(row, func(index int, text string) string { return p.cell(columns[index].Role, text).Render(text) })
	}
	return out.String()
}

// cell picks the style for one body cell by its column role.
func (p Painter) cell(role Role, text string) lipgloss.Style {
	switch role {
	case RolePrimary:
		return p.bold
	case RoleSecondary:
		return p.label
	case RoleStatus:
		return p.status(text)
	default:
		return lipgloss.NewStyle()
	}
}

// statusTones pairs a status word with its palette tone, in match order.
var statusTones = []struct {
	word string
	tone func(Colors) int32
}{
	{"succeeded", func(c Colors) int32 { return c.Succeeded }},
	{"ready", func(c Colors) int32 { return c.Succeeded }},
	{"fail", func(c Colors) int32 { return c.Failed }},
	{"error", func(c Colors) int32 { return c.Failed }},
	{"reject", func(c Colors) int32 { return c.Rejected }},
	{"running", func(c Colors) int32 { return c.Running }},
	{"building", func(c Colors) int32 { return c.Running }},
	{"pending", func(c Colors) int32 { return c.Pending }},
	{"starting", func(c Colors) int32 { return c.Starting }},
	{"cancel", func(c Colors) int32 { return c.Canceled }},
}

// status colors a status cell by its state. Anything unrecognised is muted.
func (p Painter) status(text string) lipgloss.Style {
	lower := strings.ToLower(text)
	for _, entry := range statusTones {
		if !strings.Contains(lower, entry.word) {
			continue
		}
		if !p.enabled {
			return lipgloss.NewStyle()
		}
		return lipgloss.NewStyle().Foreground(hex(entry.tone(p.colors)))
	}
	return p.muted
}

// boxedTable renders a rounded box with column rules and an accent header.
func (p Painter) boxedTable(columns []Column, rows [][]string) string {
	grid := table.New().
		Headers(Titles(columns)...).
		Rows(rows...).
		Border(lipgloss.RoundedBorder()).
		BorderStyle(p.muted).
		BorderHeader(true).
		BorderColumn(true).
		BorderRow(false).
		StyleFunc(func(row, col int) lipgloss.Style {
			cell := lipgloss.NewStyle().Padding(0, cellPadding)
			if columns[col].Role == RoleNumber {
				cell = cell.Align(lipgloss.Right)
			}
			if row == table.HeaderRow {
				return cell.Inherit(p.accent).Bold(p.enabled)
			}
			text := ""
			if row >= 0 && row < len(rows) && col < len(rows[row]) {
				text = rows[row][col]
			}
			return cell.Inherit(p.cell(columns[col].Role, text))
		})
	var out strings.Builder
	for line := range strings.SplitSeq(grid.Render(), "\n") {
		out.WriteString(Indent + strings.TrimRight(line, " ") + "\n")
	}
	return out.String()
}

// Width measures text without its styling.
func Width(text string) int {
	return lipgloss.Width(text)
}

// Widths returns the widest cell per column.
func Widths(rows [][]string) []int {
	widths := []int{}
	for _, row := range rows {
		for index, cell := range row {
			if index >= len(widths) {
				widths = append(widths, 0)
			}
			widths[index] = max(widths[index], Width(cell))
		}
	}
	return widths
}

// Bytes renders a byte count as KB, MB, or GB. Zero is a dash.
func Bytes(value int64) string {
	switch {
	case value <= 0:
		return "–"
	case value >= bytesUnit*bytesUnit*bytesUnit:
		return trimZero(fmt.Sprintf("%.1f", float64(value)/(bytesUnit*bytesUnit*bytesUnit))) + " GB"
	case value >= bytesUnit*bytesUnit:
		return trimZero(fmt.Sprintf("%.1f", float64(value)/(bytesUnit*bytesUnit))) + " MB"
	case value >= bytesUnit:
		return trimZero(fmt.Sprintf("%.1f", float64(value)/bytesUnit)) + " KB"
	default:
		return fmt.Sprintf("%d B", value)
	}
}

func trimZero(text string) string {
	return strings.TrimSuffix(text, ".0")
}

// Elapsed renders a duration the way a status line wants it: 12ms, 1.3s, 39s.
func Elapsed(value time.Duration) string {
	switch {
	case value < time.Millisecond:
		return "<1ms"
	case value < time.Second:
		return value.Round(time.Millisecond).String()
	case value < time.Minute:
		return value.Round(time.Second / 10).String()
	default:
		return value.Round(time.Second).String()
	}
}
