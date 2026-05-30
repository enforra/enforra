# DB Delete Video Demo

This demo shows the simplest Enforra story for a landing page video: an AI agent asks to delete the `customers` table, then Enforra blocks the same request before the callback can run.

No real database is used. The demo uses a fake in-memory database and makes no network calls or external API calls.

## Unsafe Version

```bash
pnpm demo:db-unsafe
```

This runs the tool callback directly. The fake `customers` table goes from `1,284` rows to `0` rows.

## Enforra Version

```bash
pnpm demo:db-enforra
```

This wraps the same callback with `enforra.enforceToolCall`. The policy returns `block`, the callback never runs, and the fake `customers` table stays at `1,284` rows.

## Policy

The demo uses:

```text
policies/starter/db-delete-video.yaml
```

## Expected Output

- Unsafe: `DISASTER: customer table deleted`
- Enforra: `PROTECTED: customer table still intact`

## Audit Logs

Audit evidence is written locally to:

```text
.enforra/audit.jsonl
```
