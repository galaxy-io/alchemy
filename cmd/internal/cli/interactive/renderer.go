// Package interactive implements Alchemy's interactive terminal menus.
package interactive

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/atterpac/dado/inline"
	"github.com/gdamore/tcell/v2"
	"golang.org/x/term"

	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/style"
)

const (
	back           = "__back__"
	settingsAction = "__settings__"
	selectionField = "selection"
	fallbackWidth  = 96
	maxValueLines  = 8
	cellPad        = " "
)

// Section is where the menus open.
type Section string

// Sections. SectionInvoke is an operation: it exits once it is done.
const (
	SectionMenu        Section = ""
	SectionFunctions   Section = "function"
	SectionInvocations Section = "invocation"
	SectionInvoke      Section = "invoke"
)

// Renderer drives the menus over one server's client.
type Renderer struct {
	in         io.Reader
	out        io.Writer
	functions  functionsv1connect.FunctionsServiceClient
	targetName string
	live       *inline.Renderer
	theme      inline.InlineTheme
	paint      style.Painter
	layout     style.Layout
	saveLayout func(style.Layout) error
	pageSize   int32
	noticeText string
	noticeOK   bool
}

// Options configures an interactive renderer.
type Options struct {
	Stdin      io.Reader
	Status     io.Writer
	Functions  functionsv1connect.FunctionsServiceClient
	TargetName string
	Layout     style.Layout
	// PageSize is how many rows a list shows at once.
	PageSize int32
	// SaveLayout persists a layout chosen in the Settings menu.
	SaveLayout func(style.Layout) error
}

// New constructs an interactive renderer for the selected server.
func New(options Options) *Renderer {
	return &Renderer{
		in: options.Stdin, out: options.Status,
		functions: options.Functions, targetName: options.TargetName,
		layout: options.Layout, saveLayout: options.SaveLayout, pageSize: options.PageSize,
		theme: alchemyTheme(style.Dark(options.Stdin, options.Status)),
		paint: style.New(options.Status),
	}
}

// Available reports whether both streams are terminals.
func Available(in io.Reader, out io.Writer) bool {
	_, typed := style.Terminal(in)
	_, shown := style.Terminal(out)
	return typed && shown
}

// Open runs the menus at section, or the main menu when it is SectionMenu.
func (r *Renderer) Open(ctx context.Context, section Section) (runErr error) {
	live := inline.NewRenderer(inline.WithOutput(r.out))
	r.live = live
	defer func() {
		r.flushNotice()
		runErr = errors.Join(runErr, live.Clear(), live.Close())
		r.live = nil
	}()
	if section != SectionMenu {
		err := r.enter(ctx, section)
		if interrupted(err) || (section == SectionInvoke && cancelled(err)) {
			return nil
		}
		if section == SectionInvoke {
			return err
		}
		r.report(err)
	}
	return r.mainMenu(ctx)
}

func (r *Renderer) mainMenu(ctx context.Context) error {
	for {
		action, err := r.choose(ctx, r.titled("Alchemy"), "", []option{
			{label: "Invoke", value: string(SectionInvoke)},
			{label: "Functions", value: string(SectionFunctions)},
			{label: "Invocations", value: string(SectionInvocations)},
			{label: "Settings", value: settingsAction},
			{label: "Exit", value: back},
		})
		if interrupted(err) || cancelled(err) || action == back {
			return nil
		}
		if err != nil {
			return err
		}
		if action == settingsAction {
			err = r.manageSettings(ctx)
		} else {
			err = r.enter(ctx, Section(action))
		}
		if interrupted(err) {
			return nil
		}
		r.report(err)
	}
}

func (r *Renderer) enter(ctx context.Context, section Section) error {
	switch section {
	case SectionFunctions:
		return r.browseFunctions(ctx, "Functions", r.manageFunction, false)
	case SectionInvoke:
		return r.browseFunctions(ctx, "Invoke", r.invokeFunction, true)
	case SectionInvocations:
		return r.browseInvocations(ctx, nil)
	default:
		return nil
	}
}

// report queues a failure for the next menu's header.
func (r *Renderer) report(err error) {
	if err != nil && !cancelled(err) {
		r.notice(false, err.Error())
	}
}

// titled appends the context name to a menu title.
func (r *Renderer) titled(base string) string {
	if r.targetName == "" {
		return base
	}
	return base + " (" + r.targetName + ")"
}

type option struct {
	label       string
	value       string
	description string
	disabled    bool
}

// spacer is an unselectable blank row between a table and its actions.
var spacer = option{disabled: true}

// tableMenu renders rows as the table the list commands print, one option each.
func (r *Renderer) tableMenu(columns []style.Column, rows [][]string, values []string) []option {
	headers := style.Titles(columns)
	widths := style.Widths(append([][]string{headers}, rows...))
	if r.layout == style.LayoutPlain {
		return plainMenu(headers, rows, values, widths)
	}
	return boxedMenu(headers, rows, values, widths)
}

func plainMenu(headers []string, rows [][]string, values []string, widths []int) []option {
	line := func(cells []string) string {
		parts := make([]string, len(cells))
		for index, cell := range cells {
			parts[index] = pad(cell, widths[index])
		}
		return strings.TrimRight(strings.Join(parts, strings.Repeat(" ", style.Gutter)), " ")
	}
	options := make([]option, 0, len(rows)+1)
	options = append(options, option{label: line(headers), disabled: true})
	for index, row := range rows {
		options = append(options, option{label: line(row), value: values[index]})
	}
	return options
}

func boxedMenu(headers []string, rows [][]string, values []string, widths []int) []option {
	rule := func(left, junction, right string) string {
		parts := make([]string, len(widths))
		for index, width := range widths {
			parts[index] = strings.Repeat("─", width+2*len(cellPad))
		}
		return left + strings.Join(parts, junction) + right
	}
	line := func(cells []string) string {
		parts := make([]string, len(cells))
		for index, cell := range cells {
			parts[index] = cellPad + pad(cell, widths[index]) + cellPad
		}
		return "│" + strings.Join(parts, "│") + "│"
	}
	options := make([]option, 0, len(rows)+len(headers))
	options = append(options,
		option{label: rule("╭", "┬", "╮"), disabled: true},
		option{label: line(headers), disabled: true},
		option{label: rule("├", "┼", "┤"), disabled: true},
	)
	for index, row := range rows {
		options = append(options, option{label: line(row), value: values[index]})
	}
	return append(options, option{label: rule("╰", "┴", "╯"), disabled: true})
}

// menuHeader is the heading above a form: a title, a toast, and detail lines.
type menuHeader struct {
	theme    inline.InlineTheme
	title    string
	notice   string
	noticeOK bool
	lines    [][2]string
	gap      bool
}

// Frame draws the header. The toast shares the title row, so menus keep their height.
func (h menuHeader) Frame(width int) *inline.Frame {
	height := 1 + len(h.lines)
	if h.gap {
		height++
	}
	frame := inline.NewFrame(max(width, 0), height)
	x := draw(frame, 0, 0, h.title, h.theme.Accent.Bold(true))
	if h.notice != "" {
		marker, tone := "✗", h.theme.Error
		if h.noticeOK {
			marker, tone = "✓", h.theme.Success
		}
		x = draw(frame, x+len(style.Indent), 0, marker+" ", tone)
		draw(frame, x, 0, h.notice, h.theme.Muted)
	}
	keyWidth := 0
	for _, line := range h.lines {
		keyWidth = max(keyWidth, style.Width(line[0]))
	}
	for index, line := range h.lines {
		padding := strings.Repeat(" ", keyWidth-style.Width(line[0])+style.Gutter)
		x := draw(frame, len(style.Indent), index+1, line[0]+padding, h.theme.Label)
		draw(frame, x, index+1, line[1], h.theme.Text)
	}
	return frame
}

// detailLines gives every line of a value its own row, capped per value.
func detailLines(pairs [][2]string) [][2]string {
	lines := make([][2]string, 0, len(pairs))
	for _, pair := range pairs {
		parts := strings.Split(strings.ReplaceAll(strings.TrimSpace(pair[1]), "\t", style.Indent), "\n")
		if len(parts) > maxValueLines {
			parts = append(parts[:maxValueLines], "…")
		}
		for index, part := range parts {
			key := pair[0]
			if index > 0 {
				key = ""
			}
			lines = append(lines, [2]string{key, part})
		}
	}
	return lines
}

func (r *Renderer) header(title string, pairs [][2]string, gap bool) menuHeader {
	notice, ok := r.takeNotice()
	return menuHeader{theme: r.theme, title: title, notice: notice, noticeOK: ok, lines: detailLines(pairs), gap: gap}
}

// choose shows a menu and returns the selected option's value.
func (r *Renderer) choose(ctx context.Context, title, description string, options []option) (string, error) {
	return r.chooseUnder(ctx, r.header(title, nil, description != ""), description, options)
}

// detail shows label and value pairs with the actions under them.
func (r *Renderer) detail(ctx context.Context, title string, pairs [][2]string, options []option) (string, error) {
	return r.chooseUnder(ctx, r.header(title, pairs, true), "", options)
}

func (r *Renderer) chooseUnder(ctx context.Context, header menuHeader, description string, options []option) (string, error) {
	choices := make([]inline.Choice, 0, len(options))
	for _, item := range options {
		choices = append(choices, inline.Choice{
			Value: item.value, Label: item.label, Description: item.description, Disabled: item.disabled,
		})
	}
	field := inline.NewSelectField(selectionField, description, choices...).Required()
	result, err := r.runForm(ctx, inline.NewForm("").SetHeader(header).Add(field))
	if err != nil {
		return "", err
	}
	selected, _ := result[selectionField].(string)
	return selected, nil
}

func (r *Renderer) runForm(ctx context.Context, form *inline.Form) (inline.FormResult, error) {
	session := inline.NewSession(r.live, inline.WithSessionInput(r.in))
	return session.Run(ctx, form.SetTheme(r.theme).QuitOnQ(true).NavigateAtBoundaries(true))
}

// notice queues an outcome line for the next menu's header.
func (r *Renderer) notice(ok bool, message string) {
	r.noticeText, r.noticeOK = message, ok
}

func (r *Renderer) takeNotice() (string, bool) {
	message, ok := r.noticeText, r.noticeOK
	r.noticeText, r.noticeOK = "", false
	return message, ok
}

// flushNotice prints a notice no menu got to show, so a session that exits still reports.
func (r *Renderer) flushNotice() {
	message, ok := r.takeNotice()
	if message == "" {
		return
	}
	marker := r.paint.Error("✗")
	if ok {
		marker = r.paint.Success("✓")
	}
	_ = r.live.Println(marker + " " + message)
}

// transcript leaves a titled block in scrollback.
func (r *Renderer) transcript(title, body string) error {
	return r.live.Println(fmt.Sprintf("%s\n\n%s\n", title, strings.TrimRight(body, "\n")))
}

func cancelled(err error) bool {
	return errors.Is(err, inline.ErrFormCancelled) || errors.Is(err, inline.ErrFormPrevious)
}

func interrupted(err error) bool {
	return errors.Is(err, inline.ErrFormInterrupted) || errors.Is(err, context.Canceled)
}

func draw(frame *inline.Frame, x, y int, text string, look tcell.Style) int {
	frame.DrawString(x, y, text, look)
	return x + style.Width(text)
}

func pad(text string, width int) string {
	return text + strings.Repeat(" ", max(width-style.Width(text), 0))
}

func renderWidth(writer io.Writer) int {
	if output, ok := writer.(*os.File); ok {
		if width, _, err := term.GetSize(int(output.Fd())); err == nil && width > 1 { //nolint:gosec // a file descriptor fits an int
			return width - 1
		}
	}
	return fallbackWidth
}
