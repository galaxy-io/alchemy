// Package text formats CLI results and renders them as terminal tables.
package text

import (
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/cmd/internal/cli/style"
)

const (
	dash        = "–"
	stampLayout = "2006-01-02 15:04"
	detailGap   = "  "
	statusLabel = "Status"

	functionIDColumns = 1

	versionStatusPrefix    = "FUNCTION_VERSION_STATUS_"
	invocationStatusPrefix = "INVOCATION_STATUS_"
	startKindPrefix        = "START_KIND_"
)

// Renderer writes results in one table layout.
type Renderer struct {
	w      io.Writer
	layout style.Layout
}

// New binds a renderer to its output and layout.
func New(w io.Writer, layout style.Layout) Renderer {
	return Renderer{w: w, layout: layout}
}

// Context is one row of the contexts table.
type Context struct {
	Name     string
	Current  bool
	Server   string
	LoggedIn bool
}

// Contexts renders configured contexts stored at location.
func (r Renderer) Contexts(items []Context, location string) error {
	p := style.New(r.w)
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		name := "  " + p.Bold(item.Name)
		if item.Current {
			name = p.Accent("●") + " " + p.Bold(item.Name)
		}
		auth := "None"
		if item.LoggedIn {
			auth = "Service account"
		}
		rows = append(rows, []string{name, item.Server, auth})
	}
	columns := []style.Column{{Title: "Name"}, {Title: "Server"}, {Title: "Auth", Role: style.RoleSecondary}}
	return r.table(p.Title("Contexts in", location), columns, rows)
}

// FunctionColumns are the headings FunctionRows fill.
func FunctionColumns() []style.Column {
	return []style.Column{
		{Title: "ID", Role: style.RolePrimary},
		{Title: "Name"},
		{Title: "Version", Role: style.RoleNumber},
		{Title: statusLabel, Role: style.RoleStatus},
		{Title: "Updated", Role: style.RoleSecondary},
	}
}

// FunctionRows formats functions, one row each.
func FunctionRows(functions []*functionsv1.Function) [][]string {
	rows := make([][]string, 0, len(functions))
	for _, function := range functions {
		current := function.GetCurrentVersion()
		rows = append(rows, []string{
			function.GetId(), function.GetName(), version(current.GetVersion()),
			status(current.GetStatus().String(), versionStatusPrefix), stamp(function.GetUpdatedAt()),
		})
	}
	return rows
}

// FunctionPairs formats one function as labels and values.
func FunctionPairs(function *functionsv1.Function) [][2]string {
	current := function.GetCurrentVersion()
	return [][2]string{
		{"ID", function.GetId()},
		{"Name", function.GetName()},
		{"Description", orDash(function.GetDescription())},
		{"Version", version(current.GetVersion())},
		{statusLabel, status(current.GetStatus().String(), versionStatusPrefix)},
		{"Image", orDash(current.GetSpec().GetImage())},
		{"vCPUs", strconv.FormatUint(uint64(function.GetResources().GetVcpus()), 10)},
		{"Memory", fmt.Sprintf("%d MiB", function.GetResources().GetMemoryMib())},
		{"Timeout", style.Elapsed(time.Duration(function.GetTimeoutMs()) * time.Millisecond)},
		{"Created", stamp(function.GetCreatedAt())},
		{"Updated", stamp(function.GetUpdatedAt())},
	}
}

// InvocationColumns are the headings InvocationRows fill.
func InvocationColumns() []style.Column {
	return []style.Column{
		{Title: "Invocation", Role: style.RolePrimary},
		{Title: "Function"},
		{Title: "Version", Role: style.RoleNumber},
		{Title: statusLabel, Role: style.RoleStatus},
		{Title: "Start", Role: style.RoleSecondary},
		{Title: "Duration", Role: style.RoleNumber},
		{Title: "Created", Role: style.RoleSecondary},
	}
}

// InvocationRows formats invocations, one row each.
func InvocationRows(invocations []*functionsv1.Invocation) [][]string {
	whole := func(id string) string { return id }
	return invocationRows(invocations, whole, whole)
}

// InvocationMenuRows shorten the invocation id and name each function, so rows fit a menu.
func InvocationMenuRows(invocations []*functionsv1.Invocation, names map[string]string) [][]string {
	return invocationRows(invocations, shortID, func(id string) string {
		if name, known := names[id]; known {
			return name
		}
		return shortID(id)
	})
}

func invocationRows(invocations []*functionsv1.Invocation, id, function func(string) string) [][]string {
	rows := make([][]string, 0, len(invocations))
	for _, invocation := range invocations {
		rows = append(rows, []string{
			id(invocation.GetId()), function(invocation.GetFunctionId()), version(invocation.GetVersion()),
			status(invocation.GetStatus().String(), invocationStatusPrefix), startKind(invocation.GetStartKind()),
			Duration(invocation.GetStats()), stamp(invocation.GetCreatedAt()),
		})
	}
	return rows
}

// InvocationPairs formats one invocation as labels and values.
func InvocationPairs(invocation *functionsv1.Invocation) [][2]string {
	failure := invocation.GetError().GetMessage()
	if failure == "" {
		failure = invocation.GetPlatformError()
	}
	return [][2]string{
		{"ID", invocation.GetId()},
		{"Function", invocation.GetFunctionId()},
		{"Version", version(invocation.GetVersion())},
		{statusLabel, status(invocation.GetStatus().String(), invocationStatusPrefix)},
		{"Start", startKind(invocation.GetStartKind())},
		{"Attempts", strconv.Itoa(int(invocation.GetAttempts()))},
		{"Duration", Duration(invocation.GetStats())},
		{"Input", style.Bytes(invocation.GetInputBytes())},
		{"Output", style.Bytes(invocation.GetOutputBytes())},
		{"Host", orDash(invocation.GetHost())},
		{"Created", stamp(invocation.GetCreatedAt())},
		{"Error", orDash(failure)},
	}
}

// FunctionMenuColumns are FunctionColumns without the id, for menus that select by row.
func FunctionMenuColumns() []style.Column {
	return FunctionColumns()[functionIDColumns:]
}

// FunctionMenuRows are FunctionRows without the id.
func FunctionMenuRows(functions []*functionsv1.Function) [][]string {
	rows := FunctionRows(functions)
	for index := range rows {
		rows[index] = rows[index][functionIDColumns:]
	}
	return rows
}

// shortID is the leading group of a UUID.
func shortID(id string) string {
	short, _, _ := strings.Cut(id, "-")
	return short
}

// Functions renders one page of functions on server.
func (r Renderer) Functions(functions []*functionsv1.Function, page *functionsv1.PaginationResponse, server, command string) error {
	if len(functions) == 0 {
		_, err := fmt.Fprintln(r.w, "No functions.")
		return err
	}
	p := style.New(r.w)
	if err := r.table(p.Title("Functions on", server), FunctionColumns(), FunctionRows(functions)); err != nil {
		return err
	}
	return pageFooter(r.w, p, len(functions), page, command)
}

// Function renders one function and its versions.
func (r Renderer) Function(function *functionsv1.Function) error {
	if err := Details(r.w, FunctionPairs(function)); err != nil {
		return err
	}
	versions := function.GetVersions()
	if len(versions) == 0 {
		return nil
	}
	rows := make([][]string, 0, len(versions))
	for _, item := range versions {
		rows = append(rows, []string{
			version(item.GetVersion()), status(item.GetStatus().String(), versionStatusPrefix),
			orDash(item.GetSpec().GetImage()), stamp(item.GetCreatedAt()),
		})
	}
	columns := []style.Column{
		{Title: "Version", Role: style.RoleNumber},
		{Title: statusLabel, Role: style.RoleStatus},
		{Title: "Image"},
		{Title: "Created", Role: style.RoleSecondary},
	}
	if _, err := fmt.Fprintln(r.w); err != nil {
		return err
	}
	return r.table(style.New(r.w).Title("Versions of", function.GetName()), columns, rows)
}

// Invocations renders one page of invocations of subject.
func (r Renderer) Invocations(invocations []*functionsv1.Invocation, page *functionsv1.PaginationResponse, subject, command string) error {
	if len(invocations) == 0 {
		_, err := fmt.Fprintln(r.w, "No invocations yet.")
		return err
	}
	p := style.New(r.w)
	if err := r.table(p.Title("Invocations of", subject), InvocationColumns(), InvocationRows(invocations)); err != nil {
		return err
	}
	return pageFooter(r.w, p, len(invocations), page, command)
}

// Invocation renders one invocation.
func (r Renderer) Invocation(invocation *functionsv1.Invocation) error {
	return Details(r.w, InvocationPairs(invocation))
}

// Details renders label and value pairs in two aligned columns, wrapped lines included.
func Details(w io.Writer, rows [][2]string) error {
	p := style.New(w)
	width := 0
	for _, row := range rows {
		width = max(width, len(row[0]))
	}
	for _, row := range rows {
		value := row[1]
		if row[0] == statusLabel {
			value = p.Status(value, value)
		}
		padding := strings.Repeat(" ", width-len(row[0]))
		value = strings.ReplaceAll(strings.TrimSpace(value), "\n", "\n"+strings.Repeat(" ", width+len(detailGap)))
		if _, err := fmt.Fprintf(w, "%s%s%s%s\n", p.Label(row[0]), padding, detailGap, value); err != nil {
			return err
		}
	}
	return nil
}

func (r Renderer) table(title string, columns []style.Column, rows [][]string) error {
	_, err := fmt.Fprintf(r.w, "%s\n\n%s", title, style.New(r.w).Grid(r.layout, columns, rows))
	return err
}

// pageFooter says how much of the collection is shown and how to get the next page.
func pageFooter(w io.Writer, p style.Painter, shown int, page *functionsv1.PaginationResponse, command string) error {
	next := page.GetNextCursor()
	if next == "" && page.GetPreviousCursor() == "" {
		return nil
	}
	parts := []string{}
	if total := page.GetTotal(); total > 0 {
		parts = append(parts, fmt.Sprintf("Showing %d of %d.", shown, total))
	}
	if next != "" {
		parts = append(parts, "To display the next page, run "+p.Bold("`"+command+" --next "+next+"`"))
	}
	_, err := fmt.Fprintf(w, "\n%s %s\n", p.Accent(">"), strings.Join(parts, " "))
	return err
}

// stamp renders a millisecond timestamp in local time, or a dash when unset.
func stamp(millis int64) string {
	if millis <= 0 {
		return dash
	}
	return time.UnixMilli(millis).Local().Format(stampLayout)
}

// Duration renders an invocation's total time, or a dash when unset.
func Duration(stats *functionsv1.InvocationStats) string {
	total := stats.GetTotalUs()
	if total <= 0 {
		return dash
	}
	return style.Elapsed(time.Duration(total) * time.Microsecond)
}

// word turns an enum name into a capitalised word, empty when unset.
func word(name, prefix string) string {
	value := strings.ToLower(strings.ReplaceAll(strings.TrimPrefix(name, prefix), "_", " "))
	if value == "" || value == "unspecified" {
		return ""
	}
	return strings.ToUpper(value[:1]) + value[1:]
}

// status renders an enum name as "● Succeeded", or a dash when unset.
func status(name, prefix string) string {
	value := word(name, prefix)
	if value == "" {
		return dash
	}
	return "● " + value
}

func startKind(kind functionsv1.StartKind) string {
	return orDash(word(kind.String(), startKindPrefix))
}

func version(number int64) string {
	if number <= 0 {
		return dash
	}
	return strconv.FormatInt(number, 10)
}

func orDash(value string) string {
	if value == "" {
		return dash
	}
	return value
}
