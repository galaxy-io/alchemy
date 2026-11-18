import json
import logging
import sys

# Log to stderr: stdout is the output, so print() would corrupt it.
logging.basicConfig(stream=sys.stderr, level=logging.INFO)
logger = logging.getLogger("handler")


def handler(event):
    return event


json.dump(handler(json.load(sys.stdin)), sys.stdout)
