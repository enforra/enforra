# Policy Language

Policy version 1 supports exact matches on `agent` and `tool` plus generic conditions over dot paths in `args` and `context`.

```yaml
version: 1
defaults:
  decision: block
policies:
  - id: approve-production-shell
    match:
      agent: coding-agent
      tool: shell.run
    conditions:
      - field: context.environment
        operator: eq
        value: production
    decision: require_approval
```

Supported decisions are `allow`, `block`, `require_approval`, and `log_only`.

## Evaluation order

Policies are evaluated from top to bottom. The first matching policy wins. If no policy matches, Enforra uses `defaults.decision`. If no default is configured, the decision is `block`.

## Match fields

`match.agent` is an exact string match against the tool-call `agent`.

`match.tool` is an exact string match against the tool-call `tool`.

A policy can specify `match.agent`, `match.tool`, or both. If both are present, both must match.

## Conditions

Condition fields use dot paths rooted at `args` or `context`, such as `args.amount`, `args.recipient`, or `context.environment`. Conditions are ANDed together.

Use `args.*` for tool arguments, such as `args.path`, `args.command`, or `args.amount`.

Use `context.*` for runtime context supplied by the application, such as `context.environment`, `context.userRole`, or `context.accountTier`.

Supported condition operators are:

- `eq`: field equals value.
- `neq`: field does not equal value.
- `gt`: field is greater than value.
- `gte`: field is greater than or equal to value.
- `lt`: field is less than value.
- `lte`: field is less than or equal to value.
- `contains`: string field contains value, or array field contains value.
- `not_contains`: string field does not contain value, or array field does not contain value.

## Creating your own policy

Create a YAML file in your application and pass its path to `createEnforraClient`. Starter policies are examples only; the SDK is not hardcoded to them.

```yaml
version: 1
defaults:
  decision: block
policies:
  - id: allow-research-read
    description: Allow read-only CRM lookup calls
    match:
      agent: research-agent
      tool: crm.lookup
    conditions:
      - field: args.accountId
        operator: contains
        value: acct_
    decision: allow

  - id: approve-production-write
    description: Require approval for production CRM updates
    match:
      agent: research-agent
      tool: crm.update
    conditions:
      - field: context.environment
        operator: eq
        value: production
    decision: require_approval
```
