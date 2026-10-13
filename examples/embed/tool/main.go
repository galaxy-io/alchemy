// Command tool runs the embed example against a running server: it registers
// embed-go, embed-rust, embed-python and embed-typescript, waits for them to
// build, then invokes each with batches of sample rows.
//
//	go run ./examples/embed/tool --count=10 --rows=100 --concurrency=4
package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/ipc"
	"github.com/apache/arrow-go/v18/arrow/memory"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
)

var langs = []string{"go", "rust", "python", "typescript"}

// The contract all four implementations share.
var (
	inputSchema = arrow.NewSchema([]arrow.Field{
		{Name: "id", Type: arrow.BinaryTypes.String},
		{Name: "text", Type: arrow.BinaryTypes.String, Nullable: true},
	}, nil)
	outputSchema = arrow.NewSchema([]arrow.Field{
		{Name: "id", Type: arrow.BinaryTypes.String},
		{Name: "cleaned_text", Type: arrow.BinaryTypes.String},
		{Name: "token_count", Type: arrow.PrimitiveTypes.Uint32},
		{Name: "embedding", Type: arrow.FixedSizeListOf(64, arrow.PrimitiveTypes.Float64)},
		{Name: "model", Type: arrow.BinaryTypes.String},
	}, nil)
)

var sampleTexts = []string{
	"  The QUICK brown fox\tjumps over the lazy dog.  ",
	"Alchemy runs each invocation in its own Firecracker microVM.",
	"Arrow batches in,\n\nArrow batches out:  no JSON on the hot path.",
	"Clean   the text, then hash character trigrams into 64 dimensions.",
	"Four languages, one contract, identical output.",
	"\x01Control bytes are dropped\x7f but unicode — ünïcödé — is kept.",
	"",
}

func main() {
	addr := flag.String("addr", "http://localhost:8780", "server address")
	rows := flag.Int("rows", 100, "rows per batch")
	count := flag.Int("count", 10, "invocations per function")
	concurrency := flag.Int("concurrency", 4, "invocations in flight at once")
	flag.Parse()

	ctx := context.Background()
	fns := functionsv1connect.NewFunctionsServiceClient(http.DefaultClient, *addr)
	input := batch(*rows)

	ids := make(map[string]string, len(langs))
	for _, lang := range langs {
		id, err := register(ctx, fns, lang)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		ids[lang] = id
	}
	failed := 0
	for _, lang := range langs {
		failed += invoke(ctx, fns, "embed-"+lang, ids[lang], input, *count, *concurrency)
	}
	if failed > 0 {
		fmt.Fprintf(os.Stderr, "%d invocations failed\n", failed)
		os.Exit(1)
	}
}

// register builds a version of embed-<lang> from its :dev image and waits
// for it. A function that already exists gets a new version, so a rebuilt
// image is always picked up. It returns the function id.
func register(ctx context.Context, fns functionsv1connect.FunctionsServiceClient, lang string) (string, error) {
	name := "embed-" + lang
	spec := &functionsv1.FunctionSpec{
		Image:    "ghcr.io/galaxy-io/alchemy/embed-" + lang + ":dev",
		Protocol: functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_EXEC,
		Contract: &functionsv1.Contract{Kind: &functionsv1.Contract_Arrow{Arrow: &functionsv1.ArrowContract{
			InputSchema:  schemaBytes(inputSchema),
			OutputSchema: schemaBytes(outputSchema),
		}}},
	}

	var id string
	var version int64
	created, err := fns.CreateFunction(ctx, connect.NewRequest(&functionsv1.CreateFunctionRequest{
		Name:        name,
		Description: "Clean text and embed it with hashed trigrams, in " + lang + ".",
		Spec:        spec,
	}))
	switch {
	case err == nil:
		id, version = created.Msg.GetFunction().GetId(), created.Msg.GetVersion().GetVersion()
	case connect.CodeOf(err) == connect.CodeAlreadyExists:
		list, err := fns.ListFunctions(ctx, connect.NewRequest(&functionsv1.ListFunctionsRequest{Search: name}))
		if err != nil {
			return "", fmt.Errorf("%s: %w", name, err)
		}
		for _, fn := range list.Msg.GetFunctions() {
			if fn.GetName() == name {
				id = fn.GetId()
			}
		}
		next, err := fns.CreateFunctionVersion(ctx, connect.NewRequest(&functionsv1.CreateFunctionVersionRequest{FunctionId: id, Spec: spec}))
		if err != nil {
			return "", fmt.Errorf("%s: %w", name, err)
		}
		version = next.Msg.GetVersion().GetVersion()
	default:
		return "", fmt.Errorf("%s: %w", name, err)
	}

	fmt.Fprintf(os.Stderr, "%s: building v%d\n", name, version)
	for {
		got, err := fns.GetFunctionVersion(ctx, connect.NewRequest(&functionsv1.GetFunctionVersionRequest{FunctionId: id, Version: version}))
		if err != nil {
			return "", fmt.Errorf("%s: %w", name, err)
		}
		switch v := got.Msg.GetVersion(); v.GetStatus() {
		case functionsv1.FunctionVersionStatus_FUNCTION_VERSION_STATUS_READY:
			fmt.Fprintf(os.Stderr, "%s: v%d ready\n", name, version)
			return id, nil
		case functionsv1.FunctionVersionStatus_FUNCTION_VERSION_STATUS_FAILED:
			return "", fmt.Errorf("%s: v%d build failed: %s", name, version, v.GetStatusMessage())
		}
		time.Sleep(time.Second)
	}
}

// invoke calls the function count times, concurrency at a time, printing a
// line per call. It returns how many failed.
func invoke(ctx context.Context, fns functionsv1connect.FunctionsServiceClient, name, id string, input []byte, count, concurrency int) int {
	var (
		wg     sync.WaitGroup
		mu     sync.Mutex
		failed int
		sem    = make(chan struct{}, concurrency)
	)
	for i := 1; i <= count; i++ {
		sem <- struct{}{}
		wg.Go(func() {
			defer func() { <-sem }()
			resp, err := fns.Invoke(ctx, connect.NewRequest(&functionsv1.InvokeRequest{FunctionId: id, Input: input}))
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err != nil:
				failed++
				fmt.Fprintf(os.Stderr, "%s #%d: %v\n", name, i, err)
			case resp.Msg.GetError() != nil:
				failed++
				fmt.Fprintf(os.Stderr, "%s #%d: function failed: %s\n", name, i, resp.Msg.GetError().GetMessage())
			default:
				st := resp.Msg.GetStats()
				fmt.Fprintf(os.Stderr, "%s #%d: %-16s acquire %-8s run %-8s total %s\n", name, i,
					startKind(st.GetStartKind()), micros(st.GetAcquireUs()), micros(st.GetRunUs()), micros(st.GetTotalUs()))
			}
		})
	}
	wg.Wait()
	return failed
}

// batch is n sample rows as an Arrow IPC stream.
func batch(n int) []byte {
	b := array.NewRecordBuilder(memory.DefaultAllocator, inputSchema)
	defer b.Release()
	ids := b.Field(0).(*array.StringBuilder)   //nolint:errcheck // the schema above fixes the types
	texts := b.Field(1).(*array.StringBuilder) //nolint:errcheck // the schema above fixes the types
	for i := range n {
		ids.Append(fmt.Sprintf("row-%d", i))
		if i%20 == 19 {
			texts.AppendNull()
			continue
		}
		texts.Append(sampleTexts[i%len(sampleTexts)])
	}
	rec := b.NewRecordBatch()
	defer rec.Release()

	var buf bytes.Buffer
	w := ipc.NewWriter(&buf, ipc.WithSchema(inputSchema))
	if err := w.Write(rec); err != nil {
		panic(err)
	}
	if err := w.Close(); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

// schemaBytes is s as the IPC stream the contract carries.
func schemaBytes(s *arrow.Schema) []byte {
	var buf bytes.Buffer
	if err := ipc.NewWriter(&buf, ipc.WithSchema(s)).Close(); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

func startKind(k functionsv1.StartKind) string {
	switch k {
	case functionsv1.StartKind_START_KIND_COLD_BOOT:
		return "cold_boot"
	case functionsv1.StartKind_START_KIND_SNAPSHOT_RESTORE:
		return "snapshot_restore"
	case functionsv1.StartKind_START_KIND_WARM:
		return "warm"
	default:
		return "-"
	}
}

func micros(us int64) string {
	return (time.Duration(us) * time.Microsecond).Round(time.Millisecond).String()
}
