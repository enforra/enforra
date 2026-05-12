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

Supported condition operators are `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, and `not_contains`.

Condition fields use dot paths rooted at `args` or `context`, such as `args.amount`, `args.recipient`, or `context.environment`. Conditions are ANDed together.

## Policy reference

- `match.agent`: optional exact string match on the incoming agent name.
- `match.tool`: optional exact string match on the incoming tool name.
- `conditions`: optional list of condition checks; all listed conditions must match.
- `field`: dot-path into either `args.*` or `context.*`.
- `operator`: one of `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `not_contains`.
- `value`: literal value used by the operator.

Evaluation behavior:

1. Policies are evaluated top-to-bottom.
2. First matching policy wins.
3. If no policy matches, Enforra uses `defaults.decision`.
4. If no default decision is configured, Enforra returns `block`.

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

If no policy matches, Enforra uses `defaults.decision`. If no default is configured, the decision is `block`.
