// embed in Go. See ../README.md for the algorithm.
//
// One Arrow record batch in on stdin, one out on stdout.
package main

import (
	"fmt"
	"math"
	"os"
	"strings"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/ipc"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

const (
	dimensions = 64
	model      = "hash-trigram-64-v1"
)

var outputSchema = arrow.NewSchema([]arrow.Field{
	{Name: "id", Type: arrow.BinaryTypes.String},
	{Name: "cleaned_text", Type: arrow.BinaryTypes.String},
	{Name: "token_count", Type: arrow.PrimitiveTypes.Uint32},
	{Name: "embedding", Type: arrow.FixedSizeListOf(dimensions, arrow.PrimitiveTypes.Float64)},
	{Name: "model", Type: arrow.BinaryTypes.String},
}, nil)

func main() {
	reader, err := ipc.NewReader(os.Stdin)
	if err != nil {
		fail("read input: %v", err)
	}
	defer reader.Release()
	if !reader.Next() {
		fail("input holds no record batch: %v", reader.Err())
	}
	in := reader.RecordBatch()
	ids := in.Column(0).(*array.String)
	texts := in.Column(1).(*array.String)

	b := array.NewRecordBuilder(memory.DefaultAllocator, outputSchema)
	defer b.Release()
	outIDs := b.Field(0).(*array.StringBuilder)
	outCleaned := b.Field(1).(*array.StringBuilder)
	outCounts := b.Field(2).(*array.Uint32Builder)
	outEmbeddings := b.Field(3).(*array.FixedSizeListBuilder)
	outValues := outEmbeddings.ValueBuilder().(*array.Float64Builder)
	outModels := b.Field(4).(*array.StringBuilder)

	for i := range int(in.NumRows()) {
		text := ""
		if texts.IsValid(i) {
			text = texts.Value(i)
		}
		cleaned := clean(text)
		tokens := tokenize(cleaned)

		outIDs.Append(ids.Value(i))
		outCleaned.Append(cleaned)
		outCounts.Append(uint32(len(tokens))) //nolint:gosec // a row's token count fits
		outEmbeddings.Append(true)
		outValues.AppendValues(embed(tokens), nil)
		outModels.Append(model)
	}

	out := b.NewRecordBatch()
	defer out.Release()
	w := ipc.NewWriter(os.Stdout, ipc.WithSchema(outputSchema))
	if err := w.Write(out); err != nil {
		fail("write output: %v", err)
	}
	if err := w.Close(); err != nil {
		fail("write output: %v", err)
	}
}

func isSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\n' || b == '\r' || b == '\f' || b == '\v'
}

func clean(text string) string {
	var b strings.Builder
	pendingSpace := false
	for i := 0; i < len(text); i++ {
		c := text[i]
		switch {
		case isSpace(c):
			pendingSpace = true
		case c < 0x20 || c == 0x7F:
			// control character: dropped
		default:
			if pendingSpace && b.Len() > 0 {
				b.WriteByte(' ')
			}
			pendingSpace = false
			if c >= 'A' && c <= 'Z' {
				c += 'a' - 'A'
			}
			b.WriteByte(c)
		}
	}
	return b.String()
}

func tokenize(cleaned string) []string {
	if cleaned == "" {
		return nil
	}
	return strings.Split(cleaned, " ")
}

func fnv1a(bytes []byte) uint32 {
	h := uint32(2166136261)
	for _, b := range bytes {
		h ^= uint32(b)
		h *= 16777619
	}
	return h
}

func embed(tokens []string) []float64 {
	v := make([]float64, dimensions)
	for _, token := range tokens {
		padded := []byte("<" + token + ">")
		for i := 0; i+3 <= len(padded); i++ {
			h := fnv1a(padded[i : i+3])
			if h&0x80000000 == 0 {
				v[h%dimensions]++
			} else {
				v[h%dimensions]--
			}
		}
	}
	var sum float64
	for _, x := range v {
		sum += x * x
	}
	if norm := math.Sqrt(sum); norm > 0 {
		for i := range v {
			v[i] /= norm
		}
	}
	return v
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
