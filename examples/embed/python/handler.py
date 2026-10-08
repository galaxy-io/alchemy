"""embed in Python. See ../README.md for the algorithm.

One Arrow record batch in on stdin, one out on stdout.
"""

import math
import sys

import pyarrow as pa

DIMENSIONS = 64
MODEL = "hash-trigram-64-v1"
SPACE = frozenset(b" \t\n\r\f\v")

OUTPUT_SCHEMA = pa.schema(
    [
        pa.field("id", pa.string(), nullable=False),
        pa.field("cleaned_text", pa.string(), nullable=False),
        pa.field("token_count", pa.uint32(), nullable=False),
        pa.field("embedding", pa.list_(pa.float64(), DIMENSIONS), nullable=False),
        pa.field("model", pa.string(), nullable=False),
    ]
)


def clean(text: str) -> str:
    out = bytearray()
    pending_space = False
    for c in text.encode("utf-8"):
        if c in SPACE:
            pending_space = True
        elif c < 0x20 or c == 0x7F:
            continue
        else:
            if pending_space and out:
                out.append(0x20)
            pending_space = False
            if 0x41 <= c <= 0x5A:
                c += 0x20
            out.append(c)
    return out.decode("utf-8")


def fnv1a(data: bytes) -> int:
    h = 2166136261
    for b in data:
        h ^= b
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def embed(tokens: list[str]) -> list[float]:
    v = [0.0] * DIMENSIONS
    for token in tokens:
        padded = b"<" + token.encode("utf-8") + b">"
        for i in range(len(padded) - 2):
            h = fnv1a(padded[i : i + 3])
            v[h % DIMENSIONS] += 1.0 if h & 0x80000000 == 0 else -1.0
    norm = math.sqrt(sum(x * x for x in v))
    if norm > 0:
        v = [x / norm for x in v]
    return v


def main() -> None:
    try:
        batch = pa.ipc.open_stream(sys.stdin.buffer).read_next_batch()
    except (pa.ArrowInvalid, StopIteration) as err:
        sys.exit(f"read input: {err}")

    ids = batch.column("id").to_pylist()
    texts = batch.column("text").to_pylist()

    cleaned = [clean(text or "") for text in texts]
    tokens = [c.split(" ") if c else [] for c in cleaned]
    out = pa.RecordBatch.from_arrays(
        [
            pa.array(ids, pa.string()),
            pa.array(cleaned, pa.string()),
            pa.array([len(t) for t in tokens], pa.uint32()),
            pa.array([embed(t) for t in tokens], pa.list_(pa.float64(), DIMENSIONS)),
            pa.array([MODEL] * len(ids), pa.string()),
        ],
        schema=OUTPUT_SCHEMA,
    )
    with pa.ipc.new_stream(sys.stdout.buffer, OUTPUT_SCHEMA) as writer:
        writer.write_batch(out)


if __name__ == "__main__":
    main()
