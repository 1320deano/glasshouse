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

## Synthetic fixtures (not recordings)

Files ending in `-synthetic.jsonl` were written by hand from the documented payload shapes in
`docs/hooks-codex-cursor.md` and `docs/hooks-claude-code.md`, because no Codex or Cursor session had
been recorded when the normalisers were written. They exist so the tests, the Room's demo data and
the continuity feature have something to replay. Field names in them are a best reading of the docs,
not ground truth. Replace each one with a real recording as soon as it exists:

- `sessions/codex-hooks-synthetic.jsonl`: Codex hook payloads (`glasshouse record codex <event>`).
- `rollouts/codex-synthetic.jsonl`: lines in the shape of `~/.codex/sessions/.../rollout-*.jsonl`.
- `sessions/cursor-synthetic.jsonl`: Cursor hook payloads.
- `sessions/claude-code-usage-limit-synthetic.jsonl`: a Claude Code turn ending in `StopFailure`
  (`rate_limit`), the moment the credit-switch story starts. The real shape of the `StopFailure`
  payload is still unobserved.

The four synthetic sessions tell one story in one imaginary app (`/home/chris/apps/storyboard`):
Claude Code starts changing the login session and runs out of credits; Codex picks the task up
and finishes it; Cursor fixes an unrelated storyboard bug.
