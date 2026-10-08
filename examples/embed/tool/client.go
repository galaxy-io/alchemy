package main

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"math/rand/v2"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/ipc"
	"github.com/apache/arrow-go/v18/arrow/memory"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/api/functions/v1/functionsv1connect"
)

// The subcommands below drive a running server so the example can be
// registered and exercised with flags instead of hand-written JSON.

const (
	defaultAddr = "http://localhost:8780"
	imagePrefix = "ghcr.io/galaxy-io/alchemy/embed-"
)

var langs = []string{"go", "rust", "python", "typescript"}

var sampleTexts = []string{
	"  The QUICK brown fox\tjumps over the lazy dog.  ",
	"Galaxy Functions runs each invocation in its own Firecracker microVM.",
	"Arrow batches in,\n\nArrow batches out:  no JSON on the hot path.",
	"Clean   the text, then hash character trigrams into 64 dimensions.",
	"Four languages, one contract, identical output.",
	"Cold boot today; snapshot restore and a warm pool next.",
	"\x01Control bytes are dropped\x7f but unicode — ünïcödé — is kept.",
	"",
}

type client struct {
	fns functionsv1connect.FunctionsServiceClient
}

func newClient(addr string) *client {
	return &client{fns: functionsv1connect.NewFunctionsServiceClient(http.DefaultClient, addr)}
}

func contractProto() *functionsv1.Contract {
	return &functionsv1.Contract{Kind: &functionsv1.Contract_Arrow{Arrow: &functionsv1.ArrowContract{
		InputSchema:  serializeSchema(inputSchema),
		OutputSchema: serializeSchema(outputSchema),
	}}}
}

// register creates embed-<lang> if it does not exist and waits for its
// latest version to build. A function whose latest build failed gets a new
// version with the same spec. It returns the function id.
func (c *client) register(ctx context.Context, lang string) (string, error) {
	name := "embed-" + lang
	spec := &functionsv1.FunctionSpec{
		Image:    imagePrefix + lang + ":dev",
		Protocol: functionsv1.InvocationProtocol_INVOCATION_PROTOCOL_EXEC,
		Contract: contractProto(),
	}
	resp, err := c.fns.CreateFunction(ctx, connect.NewRequest(&functionsv1.CreateFunctionRequest{
		Name:        name,
		Description: "Clean text and embed it with hashed trigrams, in " + lang + ".",
		Spec:        spec,
	}))
	var id string
	var version int64
	switch {
	case err == nil:
		id, version = resp.Msg.GetFunction().GetId(), resp.Msg.GetVersion().GetVersion()
		fmt.Fprintf(os.Stderr, "%s: registered %s, building\n", name, id)
	case connect.CodeOf(err) == connect.CodeAlreadyExists:
		fn, err := c.find(ctx, name)
		if err != nil {
			return "", err
		}
		id = fn.GetId()
		var latest *functionsv1.FunctionVersion
		for _, v := range fn.GetVersions() {
			if v.GetVersion() > latest.GetVersion() {
				latest = v
			}
		}
		if latest.GetStatus() == functionsv1.FunctionVersionStatus_FUNCTION_VERSION_STATUS_FAILED || latest == nil {
			created, err := c.fns.CreateFunctionVersion(ctx, connect.NewRequest(&functionsv1.CreateFunctionVersionRequest{FunctionId: id, Spec: spec}))
			if err != nil {
				return "", fmt.Errorf("%s: create version: %w", name, err)
			}
			version = created.Msg.GetVersion().GetVersion()
			fmt.Fprintf(os.Stderr, "%s: exists as %s, building v%d\n", name, id, version)
		} else {
			version = latest.GetVersion()
			fmt.Fprintf(os.Stderr, "%s: exists as %s\n", name, id)
		}
	default:
		return "", fmt.Errorf("%s: create: %w", name, err)
	}
	return id, c.waitReady(ctx, name, id, version)
}

// find returns the function called name with its versions.
func (c *client) find(ctx context.Context, name string) (*functionsv1.Function, error) {
	resp, err := c.fns.ListFunctions(ctx, connect.NewRequest(&functionsv1.ListFunctionsRequest{Search: name}))
	if err != nil {
		return nil, fmt.Errorf("%s: list: %w", name, err)
	}
	for _, fn := range resp.Msg.GetFunctions() {
		if fn.GetName() != name {
			continue
		}
		full, err := c.fns.GetFunction(ctx, connect.NewRequest(&functionsv1.GetFunctionRequest{Id: fn.GetId(), IncludeVersions: true}))
		if err != nil {
			return nil, fmt.Errorf("%s: get: %w", name, err)
		}
		return full.Msg.GetFunction(), nil
	}
	return nil, fmt.Errorf("%s: not found", name)
}

func (c *client) waitReady(ctx context.Context, name, id string, version int64) error {
	for {
		resp, err := c.fns.GetFunctionVersion(ctx, connect.NewRequest(&functionsv1.GetFunctionVersionRequest{FunctionId: id, Version: version}))
		if err != nil {
			return fmt.Errorf("%s: get version: %w", name, err)
		}
		v := resp.Msg.GetVersion()
		switch v.GetStatus() {
		case functionsv1.FunctionVersionStatus_FUNCTION_VERSION_STATUS_READY:
			fmt.Fprintf(os.Stderr, "%s: v%d ready\n", name, version)
			return nil
		case functionsv1.FunctionVersionStatus_FUNCTION_VERSION_STATUS_FAILED:
			return fmt.Errorf("%s: v%d build failed: %s", name, version, v.GetStatusMessage())
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}
}

// batch builds an IPC batch of n sample rows.
func batch(n int, rng *rand.Rand) []byte {
	b := array.NewRecordBuilder(memory.DefaultAllocator, inputSchema)
	defer b.Release()
	ids := b.Field(0).(*array.StringBuilder)
	texts := b.Field(1).(*array.StringBuilder)
	for i := range n {
		ids.Append(fmt.Sprintf("row-%d", i))
		if rng.IntN(20) == 0 {
			texts.AppendNull()
			continue
		}
		texts.Append(sampleTexts[rng.IntN(len(sampleTexts))])
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

// invoke runs count invocations of id, concurrency at a time, and reports
// each one on a line.
func (c *client) invoke(ctx context.Context, name, id string, rows, count, concurrency int) error {
	rng := rand.New(rand.NewPCG(1, 2)) //nolint:gosec // deterministic sample data, not security
	input := batch(rows, rng)

	var wg sync.WaitGroup
	sem := make(chan struct{}, concurrency)
	var mu sync.Mutex
	var failures int
	for i := range count {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			resp, err := c.fns.Invoke(ctx, connect.NewRequest(&functionsv1.InvokeRequest{FunctionId: id, Input: input}))
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err != nil:
				failures++
				fmt.Fprintf(os.Stderr, "%s #%d: %v\n", name, i+1, err)
			case resp.Msg.GetError() != nil:
				failures++
				fmt.Fprintf(os.Stderr, "%s #%d: function failed: %s\n", name, i+1, resp.Msg.GetError().GetMessage())
			default:
				st := resp.Msg.GetStats()
				fmt.Fprintf(os.Stderr, "%s #%d: ok  acquire %s  run %s  total %s\n", name, i+1,
					micros(st.GetAcquireUs()), micros(st.GetRunUs()), micros(st.GetTotalUs()))
			}
		}()
	}
	wg.Wait()
	if failures > 0 {
		return fmt.Errorf("%s: %d of %d invocations failed", name, failures, count)
	}
	return nil
}

func micros(us int64) string {
	return (time.Duration(us) * time.Microsecond).Round(time.Millisecond).String()
}

func parseLangs(s string) ([]string, error) {
	if s == "all" {
		return langs, nil
	}
	var out []string
	for _, l := range strings.Split(s, ",") {
		l = strings.TrimSpace(l)
		known := false
		for _, k := range langs {
			known = known || k == l
		}
		if !known {
			return nil, fmt.Errorf("unknown language %q (go, rust, python, typescript)", l)
		}
		out = append(out, l)
	}
	return out, nil
}

func registerCmd(args []string) error {
	fs := flag.NewFlagSet("register", flag.ExitOnError)
	addr := fs.String("addr", defaultAddr, "server address")
	lang := fs.String("lang", "all", "language, comma-separated, or all")
	_ = fs.Parse(args)
	ls, err := parseLangs(*lang)
	if err != nil {
		return err
	}
	c := newClient(*addr)
	for _, l := range ls {
		if _, err := c.register(context.Background(), l); err != nil {
			return err
		}
	}
	return nil
}

func invokeCmd(args []string) error {
	fs := flag.NewFlagSet("invoke", flag.ExitOnError)
	addr := fs.String("addr", defaultAddr, "server address")
	lang := fs.String("lang", "all", "language, comma-separated, or all")
	rows := fs.Int("rows", 100, "rows per batch")
	count := fs.Int("count", 10, "invocations per function")
	concurrency := fs.Int("concurrency", 4, "invocations in flight at once")
	_ = fs.Parse(args)
	ls, err := parseLangs(*lang)
	if err != nil {
		return err
	}
	c := newClient(*addr)
	var errs []error
	for _, l := range ls {
		name := "embed-" + l
		fn, err := c.find(context.Background(), name)
		if err != nil {
			return err
		}
		if err := c.invoke(context.Background(), name, fn.GetId(), *rows, *count, *concurrency); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func demoCmd(args []string) error {
	fs := flag.NewFlagSet("demo", flag.ExitOnError)
	addr := fs.String("addr", defaultAddr, "server address")
	rows := fs.Int("rows", 100, "rows per batch")
	count := fs.Int("count", 10, "invocations per function")
	concurrency := fs.Int("concurrency", 4, "invocations in flight at once")
	_ = fs.Parse(args)
	c := newClient(*addr)
	ids := make(map[string]string, len(langs))
	for _, l := range langs {
		id, err := c.register(context.Background(), l)
		if err != nil {
			return err
		}
		ids[l] = id
	}
	var errs []error
	for _, l := range langs {
		if err := c.invoke(context.Background(), "embed-"+l, ids[l], *rows, *count, *concurrency); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
