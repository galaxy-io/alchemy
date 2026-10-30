import json
import sys


def handler(event):
    return event


json.dump(handler(json.load(sys.stdin)), sys.stdout)
