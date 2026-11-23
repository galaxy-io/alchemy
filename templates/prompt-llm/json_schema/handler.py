"""Prompt an LLM: fills a prompt from a record and returns the model's completion."""

import json
import os
import sys
import urllib.error
import urllib.request

CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_S = 30
# The prompt, with {field} filled from the record. Edit it to ask your own.
PROMPT = "Write a two sentence welcome email to {name} about {product}. Reply with the email only."
# The output field the completion goes to.
OUTPUT_FIELD = "email"


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


json.dump({OUTPUT_FIELD: complete(json.load(sys.stdin))}, sys.stdout)
