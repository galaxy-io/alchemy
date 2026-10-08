// Command tool is the development helper for the embed example. It
// owns the Arrow schemas of the contract and converts between JSON rows and
// the IPC batches the function consumes and produces, so a shell script can
// drive the function without an Arrow library.
//
//	tool contract            print the contract as JSON for CreateFunction
//	tool encode < rows.json  JSON array of {id, text} -> IPC batch
//	tool decode < batch.ipc  IPC batch -> JSON array of output rows
//	tool register            create embed-<lang> on a running server
//	tool invoke              invoke embed-<lang> with generated batches
//	tool demo                register all four, then invoke each
package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/ipc"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

const dimensions = 64

var (
	inputSchema = arrow.NewSchema([]arrow.Field{
		{Name: "id", Type: arrow.BinaryTypes.String},
		{Name: "text", Type: arrow.BinaryTypes.String, Nullable: true},
	}, nil)
	outputSchema = arrow.NewSchema([]arrow.Field{
		{Name: "id", Type: arrow.BinaryTypes.String},
		{Name: "cleaned_text", Type: arrow.BinaryTypes.String},
		{Name: "token_count", Type: arrow.PrimitiveTypes.Uint32},
		{Name: "embedding", Type: arrow.FixedSizeListOf(dimensions, arrow.PrimitiveTypes.Float64)},
		{Name: "model", Type: arrow.BinaryTypes.String},
	}, nil)
)

type inputRow struct {
	ID   string  `json:"id"`
	Text *string `json:"text"`
}

type outputRow struct {
	ID          string    `json:"id"`
	CleanedText string    `json:"cleaned_text"`
	TokenCount  uint32    `json:"token_count"`
	Embedding   []float64 `json:"embedding"`
	Model       string    `json:"model"`
}

func main() {
	if len(os.Args) < 2 {
		fail("usage: tool contract|encode|decode|register|invoke|demo [flags]")
	}
	var err error
	switch args := os.Args[2:]; os.Args[1] {
	case "contract":
		err = contract()
	case "encode":
		err = encode()
	case "decode":
		err = decode()
	case "register":
		err = registerCmd(args)
	case "invoke":
		err = invokeCmd(args)
	case "demo":
		err = demoCmd(args)
	default:
		fail("unknown command %q", os.Args[1])
	}
	if err != nil {
		fail("%v", err)
	}
}

func contract() error {
	return json.NewEncoder(os.Stdout).Encode(map[string]any{
		"arrow": map[string]string{
			"input_schema":  base64.StdEncoding.EncodeToString(serializeSchema(inputSchema)),
			"output_schema": base64.StdEncoding.EncodeToString(serializeSchema(outputSchema)),
		},
	})
}

func serializeSchema(s *arrow.Schema) []byte {
	var buf bytes.Buffer
	w := ipc.NewWriter(&buf, ipc.WithSchema(s))
	if err := w.Close(); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

func encode() error {
	var rows []inputRow
	if err := json.NewDecoder(os.Stdin).Decode(&rows); err != nil {
		return fmt.Errorf("read rows: %w", err)
	}
	b := array.NewRecordBuilder(memory.DefaultAllocator, inputSchema)
	defer b.Release()
	ids := b.Field(0).(*array.StringBuilder)
	texts := b.Field(1).(*array.StringBuilder)
	for _, r := range rows {
		ids.Append(r.ID)
		if r.Text == nil {
			texts.AppendNull()
		} else {
			texts.Append(*r.Text)
		}
	}
	rec := b.NewRecordBatch()
	defer rec.Release()

	w := ipc.NewWriter(os.Stdout, ipc.WithSchema(inputSchema))
	if err := w.Write(rec); err != nil {
		return err
	}
	return w.Close()
}

func decode() error {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		return err
	}
	r, err := ipc.NewReader(bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("read IPC: %w", err)
	}
	defer r.Release()
	if !r.Next() {
		return fmt.Errorf("stream holds no batch: %v", r.Err())
	}
	rec := r.RecordBatch()

	ids := rec.Column(0).(*array.String)
	cleaned := rec.Column(1).(*array.String)
	counts := rec.Column(2).(*array.Uint32)
	embeddings := rec.Column(3).(*array.FixedSizeList)
	values := embeddings.ListValues().(*array.Float64)
	models := rec.Column(4).(*array.String)

	rows := make([]outputRow, rec.NumRows())
	for i := range rows {
		start, end := embeddings.ValueOffsets(i)
		rows[i] = outputRow{
			ID:          ids.Value(i),
			CleanedText: cleaned.Value(i),
			TokenCount:  counts.Value(i),
			Embedding:   values.Float64Values()[start:end],
			Model:       models.Value(i),
		}
	}
	return json.NewEncoder(os.Stdout).Encode(rows)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
