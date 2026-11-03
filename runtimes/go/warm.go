// warm builds the packages a handler is expected to import, so their
// compiled form is in the image's build cache. It is removed once built.
package main

import (
	"encoding/json"
	"os"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/ipc"
	"github.com/apache/arrow-go/v18/arrow/memory"
)

func main() {
	_ = json.NewEncoder(os.Stdout)
	_ = arrow.NewSchema(nil, nil)
	_ = array.NewRecordBuilder(memory.DefaultAllocator, arrow.NewSchema(nil, nil))
	_, _ = ipc.NewReader(os.Stdin)
}
