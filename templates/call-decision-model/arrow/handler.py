"""Call a decision model: asks a decision model typed questions about each row."""

import json
import os
import sys
import urllib.error
import urllib.request

import pyarrow as pa

DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions"
TIMEOUT_S = 30
# A yes probability at or above this makes a yes or no answer true.
THRESHOLD = 0.5

# What to ask about each row, by output field. Edit these to ask your own.
QUESTIONS = {
    "urgent": {"type": "noul", "instructions": "Does this message need a reply today?"},
    "churn_risk": {
        "type": "noul",
        "instructions": "Is the sender thinking of cancelling?",
    },
    "team": {
        "type": "choice",
        "instructions": "Which team should handle this message?",
        "criteria": {
            "billing": "Payments, invoices and refunds",
            "support": "Bugs and how-to questions",
            "sales": "Pricing, plans and upgrades",
        },
    },
}
# Yes or no questions answered as true or false; the rest return the probability.
BOOLEANS = {"urgent"}
# Rows per invocation; each makes one paid call, so send larger batches in parts.
MAX_ROWS = 20
# The output batch's schema; it must match the output contract.
OUTPUT = pa.schema(
    [
        pa.field("urgent", pa.bool_()),
        pa.field("churn_risk", pa.float64()),
        pa.field("team", pa.string()),
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


def ask(record: dict) -> dict:
    body = {
        "model": os.environ["DECISION_MODEL"],
        "state": json.dumps(record),
        "questions": QUESTIONS,
    }
    return post(DECISIONS_URL, body)["answers"]


def value(name: str, answer: dict):
    match answer.get("type"):
        case "noul":
            return answer["noul"] >= THRESHOLD if name in BOOLEANS else answer["noul"]
        case "choice":
            return answer["choice"]
        case _:
            return None


def decide(record: dict) -> dict:
    answers = ask(record)
    return {name: value(name, answers.get(name, {})) for name in QUESTIONS}


records = pa.ipc.open_stream(sys.stdin.buffer).read_next_batch().to_pylist()
if len(records) > MAX_ROWS:
    raise ValueError(
        f"{len(records)} rows is over MAX_ROWS ({MAX_ROWS}); send the batch in parts"
    )
rows = [decide(record) for record in records]
with pa.ipc.new_stream(sys.stdout.buffer, OUTPUT) as writer:
    writer.write_batch(pa.RecordBatch.from_pylist(rows, schema=OUTPUT))
