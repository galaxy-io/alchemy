"""Generate embeddings: embeds a record's text into a vector, or null when it has none."""

import json
import os
import sys
import urllib.error
import urllib.request

EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
TIMEOUT_S = 30
# The vector's length; it must match the output contract's embedding size.
DIMENSIONS = 512
# The input fields embedded, each as "name: value".
FIELDS = ("title", "body")


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


record = json.load(sys.stdin)
content = text(record)
json.dump(
    {"id": record["id"], "embedding": embed([content])[0] if content else None},
    sys.stdout,
)
