import sys

import pyarrow as pa


def handler(batch: pa.RecordBatch) -> pa.RecordBatch:
    return batch


output = handler(pa.ipc.open_stream(sys.stdin.buffer).read_next_batch())
with pa.ipc.new_stream(sys.stdout.buffer, output.schema) as writer:
    writer.write_batch(output)
