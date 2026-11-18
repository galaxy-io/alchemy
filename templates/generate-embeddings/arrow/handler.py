"""Generate embeddings: embeds each row's text into a vector, or null when it has none."""

import json
import os
import sys
import urllib.error
import urllib.request

import pyarrow as pa

EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
TIMEOUT_S = 30
# The vector's length; it must match the output contract's embedding size.
DIMENSIONS = 512
# The input fields embedded, each as "name: value".
FIELDS = ("title", "body")
# Texts sent to the model per request.
BATCH = 256
# The output batch's schema; it must match the output contract.
OUTPUT = pa.schema(
    [
        pa.field("id", pa.string()),
        pa.field("embedding", pa.list_(pa.float32(), DIMENSIONS)),
    ]
)


def post(url: str, body: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"OpenRouter returned {e.code}: {e.read().decode(errors='replace')[:500]}"
        ) from None


def text(record: dict) -> str:
    return "\n".join(f"{name}: {record[name]}" for name in FIELDS if record.get(name))


def embed(texts: list[str]) -> list[list[float]]:
    body = {
        "model": os.environ["EMBEDDING_MODEL"],
        "input": texts,
        "dimensions": DIMENSIONS,
    }
    data = post(EMBEDDINGS_URL, body)["data"]
    if sorted(item["index"] for item in data) != list(range(len(texts))):
        raise RuntimeError(
            f"embeddings came back for indexes other than 0 to {len(texts) - 1}"
        )
    return [item["embedding"] for item in sorted(data, key=lambda item: item["index"])]


records = pa.ipc.open_stream(sys.stdin.buffer).read_next_batch().to_pylist()
texts = [text(record) for record in records]
# Rows with no text get a null embedding; the rest are embedded BATCH at a time.
filled = [i for i, content in enumerate(texts) if content]
vectors = {}
for start in range(0, len(filled), BATCH):
    chunk = filled[start : start + BATCH]
    vectors.update(zip(chunk, embed([texts[i] for i in chunk]), strict=True))
rows = [
    {"id": record["id"], "embedding": vectors.get(i)}
    for i, record in enumerate(records)
]
with pa.ipc.new_stream(sys.stdout.buffer, OUTPUT) as writer:
    writer.write_batch(pa.RecordBatch.from_pylist(rows, schema=OUTPUT))
