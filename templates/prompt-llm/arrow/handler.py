"""Prompt an LLM: fills a prompt from each row and returns the model's completion."""

import json
import os
import sys
import urllib.error
import urllib.request

import pyarrow as pa

CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_S = 30
# The prompt, with {field} filled from the row. Edit it to ask your own.
PROMPT = "Write a two sentence welcome email to {name} about {product}. Reply with the email only."
# The output field the completion goes to.
OUTPUT_FIELD = "email"
# Rows per invocation; each makes one paid call, so send larger batches in parts.
MAX_ROWS = 20
# The output batch's schema; it must match the output contract.
OUTPUT = pa.schema([pa.field(OUTPUT_FIELD, pa.string())])


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


def complete(record: dict) -> str:
    prompt = PROMPT.format_map(
        {key: "" if value is None else value for key, value in record.items()}
    )
    body = {
        "model": os.environ["LLM_MODEL"],
        "messages": [{"role": "user", "content": prompt}],
    }
    message = post(CHAT_URL, body)["choices"][0]["message"]
    if not message.get("content"):
        raise RuntimeError(
            f"the model gave no completion: {message.get('refusal') or 'empty reply'}"
        )
    return message["content"].strip()


records = pa.ipc.open_stream(sys.stdin.buffer).read_next_batch().to_pylist()
if len(records) > MAX_ROWS:
    raise ValueError(
        f"{len(records)} rows is over MAX_ROWS ({MAX_ROWS}); send the batch in parts"
    )
rows = [{OUTPUT_FIELD: complete(record)} for record in records]
with pa.ipc.new_stream(sys.stdout.buffer, OUTPUT) as writer:
    writer.write_batch(pa.RecordBatch.from_pylist(rows, schema=OUTPUT))
