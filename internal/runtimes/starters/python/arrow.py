import logging
import sys

import pyarrow as pa

# Log to stderr: stdout is the output, so print() would corrupt it.
logging.basicConfig(stream=sys.stderr, level=logging.INFO)
logger = logging.getLogger("handler")


def handler(batch: pa.RecordBatch) -> pa.RecordBatch:
    return batch


output = handler(pa.ipc.open_stream(sys.stdin.buffer).read_next_batch())
with pa.ipc.new_stream(sys.stdout.buffer, output.schema) as writer:
    writer.write_batch(output)
