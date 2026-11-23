# Templates

Templates are functions to build from. The server serves them through `ListTemplates`, and the web UI offers them as cards on the Choose source step.

Each template has a `handler.py` per contract kind, `<id>/json_schema/handler.py` and `<id>/arrow/handler.py`, and a `template.json` with its label, description, timeout, variables, secrets and a sample contract in each kind. Adding a template is adding a directory. The JSON Schema handler reads one record on stdin and writes one on stdout. The Arrow handler reads a record batch and writes one with the same rows. Both call OpenRouter. What it asks or embeds is a constant at the top of the file, so you change it by editing the code.

| Template | What it does |
|---|---|
| `call-decision-model` | Asks a decision model the questions in `QUESTIONS` through OpenRouter's [Decisions API](https://openrouter.ai/docs/guides/features/decisions). Yes or no questions in `BOOLEANS` return true or false, the rest a probability, and choice questions return the option |
| `generate-embeddings` | Embeds the input `FIELDS` through OpenRouter's embeddings API into a vector of `DIMENSIONS` floats |
| `prompt-llm` | Fills `PROMPT` from the record's fields and returns the completion in `OUTPUT_FIELD` |
| `enrich-web-search` | Searches the web through OpenRouter's web plugin (`ENGINE`: `exa`, `parallel`, `perplexity` or `native`) and fills `FIELDS`, with the pages in `sources` |

Templates need network egress and read `OPENROUTER_API_KEY`, an [OpenRouter](https://openrouter.ai) key, with the model in `DECISION_MODEL` (`typesafe/jev-1.14` by default), `EMBEDDING_MODEL` (`openai/text-embedding-3-small`) or `LLM_MODEL` (`anthropic/claude-haiku-5.5`). A failed call raises with OpenRouter's error. Every call is paid, so templates set no retries and a timeout sized for their work, and the Arrow handlers that call once per row cap a batch at `MAX_ROWS`.
