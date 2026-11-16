package ui

import (
	"slices"
	"strings"
	"testing"
)

func TestParseReturnOrigins(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  []string
	}{
		{name: "unset", input: "", want: nil},
		{name: "one origin", input: "https://filament.example.com", want: []string{"https://filament.example.com"}},
		{name: "list with spaces", input: " https://a.example.com , http://localhost:5173 ", want: []string{"https://a.example.com", "http://localhost:5173"}},
		{name: "trailing slash and case", input: "https://Filament.Example.com/", want: []string{"https://filament.example.com"}},
		{name: "default ports", input: "https://a.example.com:443,http://b.example.com:80", want: []string{"https://a.example.com", "http://b.example.com"}},
		{name: "other port kept", input: "https://a.example.com:8443", want: []string{"https://a.example.com:8443"}},
		{name: "empty entries skipped", input: "https://a.example.com,,", want: []string{"https://a.example.com"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseReturnOrigins(tt.input)
			if err != nil {
				t.Fatal(err)
			}
			if !slices.Equal(got, tt.want) {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseReturnOriginsRejects(t *testing.T) {
	for _, input := range []string{
		"filament.example.com",
		"ftp://filament.example.com",
		"javascript:alert(1)",
		"https://filament.example.com/pipelines",
		"https://filament.example.com?x=1",
		"https://filament.example.com#x",
		"https://user@filament.example.com",
		"https://",
		"https://a.example.com,nope",
	} {
		t.Run(input, func(t *testing.T) {
			if got, err := ParseReturnOrigins(input); err == nil {
				t.Errorf("got %q, want an error", got)
			}
		})
	}
}

func TestRenderIndex(t *testing.T) {
	got, err := renderIndex([]byte("<head></head>"), Config{})
	if err != nil {
		t.Fatal(err)
	}
	if want := `<head><script type="application/json" id="alchemy-runtime-config">{}</script></head>`; string(got) != want {
		t.Errorf("got %s, want %s", got, want)
	}
	got, err = renderIndex([]byte("<head></head>"), Config{ReturnOrigins: []string{"https://a.example.com/</script>"}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(got), "/</script></script>") {
		t.Errorf("config closed the script early: %s", got)
	}
	if _, err := renderIndex([]byte("<html></html>"), Config{}); err == nil {
		t.Error("want an error for an index.html without </head>")
	}
}
