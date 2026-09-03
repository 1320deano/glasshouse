# Fixtures

Recorded real hook payloads from each agent. These are the ground truth for the
schema, the translator and the stage machine: a fixture session replayed through
the connector must produce a deterministic sequence of tile states.

- `raw/<tool>/<session_id>.jsonl` — untouched recordings (git-ignored; may contain prompt text).
- `sessions/<name>.jsonl` — curated, redacted recordings that are committed and used by tests.

Record a Claude Code session by enabling the recording hooks in `.claude/settings.json`
(already configured for this repo) and running Claude Code in this folder, or headless:

```
claude -p "read package.json and tell me the workspace packages" --output-format json
```

Recording is done by `record-hook.mjs`, which has no dependencies, prints nothing and
always exits 0, so it can never block or change what the agent does.
