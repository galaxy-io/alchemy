"""Call a decision model: asks a decision model typed questions about a record."""

import json
import os
import sys
import urllib.error
import urllib.request

DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions"
TIMEOUT_S = 30
# A yes probability at or above this makes a yes or no answer true.
THRESHOLD = 0.5

# What to ask about each record, by output field. Edit these to ask your own.
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


json.dump(decide(json.load(sys.stdin)), sys.stdout)
