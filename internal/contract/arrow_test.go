package contract

import (
	"testing"

	"github.com/apache/arrow-go/v18/arrow"
)

func extensionField(name string, t arrow.DataType, extension string) arrow.Field {
	f := arrow.Field{Name: name, Type: t}
	if extension != "" {
		f.Metadata = arrow.NewMetadata([]string{extensionNameKey}, []string{extension})
	}
	return f
}

func TestMatchSchemaExtensions(t *testing.T) {
	uuid := &arrow.FixedSizeBinaryType{ByteWidth: 16}
	jsonList := func(extension string) arrow.DataType {
		return arrow.ListOfField(extensionField("item", arrow.BinaryTypes.String, extension))
	}
	jsonStruct := func(extension string) arrow.DataType {
		return arrow.StructOf(extensionField("payload", arrow.BinaryTypes.String, extension))
	}
	jsonUnion := func(extension string) arrow.DataType {
		return arrow.DenseUnionOf([]arrow.Field{extensionField("payload", arrow.BinaryTypes.String, extension)}, []arrow.UnionTypeCode{0})
	}
	tests := []struct {
		name      string
		got, want arrow.Field
		ok        bool
	}{
		{"json matches json", extensionField("a", arrow.BinaryTypes.String, "arrow.json"), extensionField("a", arrow.BinaryTypes.String, "arrow.json"), true},
		{"utf8 is not json", extensionField("a", arrow.BinaryTypes.String, ""), extensionField("a", arrow.BinaryTypes.String, "arrow.json"), false},
		{"json is not utf8", extensionField("a", arrow.BinaryTypes.String, "arrow.json"), extensionField("a", arrow.BinaryTypes.String, ""), false},
		{"uuid matches uuid", extensionField("a", uuid, "arrow.uuid"), extensionField("a", uuid, "arrow.uuid"), true},
		{"binary is not uuid", extensionField("a", uuid, ""), extensionField("a", uuid, "arrow.uuid"), false},
		{"list of json matches", extensionField("a", jsonList("arrow.json"), ""), extensionField("a", jsonList("arrow.json"), ""), true},
		{"list of utf8 is not list of json", extensionField("a", jsonList(""), ""), extensionField("a", jsonList("arrow.json"), ""), false},
		{"struct of json matches", extensionField("a", jsonStruct("arrow.json"), ""), extensionField("a", jsonStruct("arrow.json"), ""), true},
		{"struct of utf8 is not struct of json", extensionField("a", jsonStruct(""), ""), extensionField("a", jsonStruct("arrow.json"), ""), false},
		{"union of json matches", extensionField("a", jsonUnion("arrow.json"), ""), extensionField("a", jsonUnion("arrow.json"), ""), true},
		{"union of utf8 is not union of json", extensionField("a", jsonUnion(""), ""), extensionField("a", jsonUnion("arrow.json"), ""), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			violations := matchSchema(arrow.NewSchema([]arrow.Field{tt.got}, nil), arrow.NewSchema([]arrow.Field{tt.want}, nil))
			if ok := len(violations) == 0; ok != tt.ok {
				t.Fatalf("ok = %v, want %v: %v", ok, tt.ok, violations)
			}
		})
	}
}

func TestFieldTypeNamesNestedExtensions(t *testing.T) {
	f := arrow.Field{Name: "tags", Type: arrow.ListOfField(extensionField("item", arrow.BinaryTypes.String, "arrow.json"))}
	if got, want := fieldType(f), "list<arrow.json<utf8>>"; got != want {
		t.Fatalf("fieldType = %q, want %q", got, want)
	}
}

func TestFieldTypeNamesStructExtensions(t *testing.T) {
	f := arrow.Field{Name: "a", Type: arrow.StructOf(extensionField("payload", arrow.BinaryTypes.String, "arrow.json"))}
	if got, want := fieldType(f), "struct<payload: arrow.json<utf8>>"; got != want {
		t.Fatalf("fieldType = %q, want %q", got, want)
	}
}
