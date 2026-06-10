# Database write guard

Agents that can mutate data need a gate before delete or update callbacks run.

## Problem

An agent may request `db.deleteTable`, `db.update`, or similar tools. In production, an unapproved delete can remove customer data. Prompting alone does not stop the callback from running; policy before execution does.

## What Enforra checks

- `tool` (`db.deleteTable` in the runnable demo)
- `args.table`
- `context.environment`

## Policy behavior

Runnable demo (`pnpm demo:db-enforra`):

| Tool             | Args / context                                | Decision | Callback runs |
| ---------------- | --------------------------------------------- | -------- | ------------- |
| `db.deleteTable` | `table: customers`, `environment: production` | `block`  | no            |

The [policy pack](../../policy-packs/database-write-guard.yaml) includes commented rules for read-only queries, production updates, and non-production `log_only` writes. Those rules are valid syntax but are not run by any demo in this repository. Customize `match.tool` to your ORM or SQL tool names.

## Run the example

Protected path:

```bash
pnpm demo:db-enforra
```

Unprotected contrast (callback deletes fake data):

```bash
pnpm demo:db-unsafe
```

**Demo policy:** [policies/starter/db-delete-video.yaml](../../policies/starter/db-delete-video.yaml)

**Policy pack:** [policy-packs/database-write-guard.yaml](../../policy-packs/database-write-guard.yaml) — not loaded by the commands above. It is provided as a reusable starter policy for this use case.

## Expected result

```text
Enforra decision: block
Matched policy: block-production-customer-delete
Callback executed: no

customers table after: 1,284 rows

PROTECTED: customer table still intact

Audit log written to .enforra/audit.jsonl
```

The unsafe demo ends with `DISASTER: customer table deleted` and zero rows.

## Audit record

```text
.enforra/audit.jsonl
```

(relative to the demo working directory when using `pnpm demo:db-enforra`)

Records include `decision: block`, `matchedPolicyId`, and show the callback did not run (`status` reflects no execution).

## What this proves

The agent can request a destructive database action, but the delete callback only runs when policy allows it. With the demo policy, production `customers` delete is blocked and row count stays at 1,284. Enforra does not connect to a real database.

## Core model

Your application owns the database callback. Enforra evaluates policy before that callback and writes local audit evidence. This is an OSS execution gate, not a database proxy or compliance certification.
