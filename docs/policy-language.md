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

Condition fields use dot paths rooted at `args` or `context`, such as `args.amount`, `args.recipient`, or `context.environment`. A flat condition array means all conditions must pass. Grouped conditions can express `all`, `any`, or both.

## Policy reference

- `match.agent`: optional exact string match on the incoming agent name.
- `match.tool`: optional exact string match on the incoming tool name.
- `conditions`: optional flat list of condition checks, or an object with `all` and/or `any` groups.
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

## Flat conditions

Flat condition arrays are supported for backwards compatibility and simple policies. Every condition must pass.

```yaml
policies:
  - id: approve-medium-refunds
    match:
      tool: stripe.refund
    conditions:
      - field: args.amount
        operator: gt
        value: 50
      - field: args.amount
        operator: lte
        value: 500
    decision: require_approval
```

## `all` groups

Use `all` when every condition in a group must pass.

```yaml
policies:
  - id: approve-medium-production-refunds
    match:
      tool: stripe.refund
    conditions:
      all:
        - field: args.amount
          operator: gte
          value: 100
        - field: args.amount
          operator: lte
          value: 500
        - field: context.environment
          operator: eq
          value: production
    decision: require_approval
```

## `any` groups

Use `any` when at least one condition in a group must pass.

```yaml
policies:
  - id: approve-external-or-sensitive-email
    match:
      tool: email.send
    conditions:
      any:
        - field: args.recipient
          operator: not_contains
          value: "@example.com"
        - field: args.subject
          operator: contains
          value: "confidential"
    decision: require_approval
```

## Combining `all` and `any`

When both `all` and `any` are present, both groups must pass. This example requires approval for package or shell commands in production.

```yaml
policies:
  - id: approve-production-command
    match:
      agent: coding-agent
    conditions:
      all:
        - field: context.environment
          operator: eq
          value: production
      any:
        - field: args.command
          operator: contains
          value: "npm install"
        - field: args.command
          operator: contains
          value: "rm "
    decision: require_approval
```

If `conditions` is omitted, the policy matches only on `match.agent` and/or `match.tool`. A policy with empty `match` and no `conditions` is rejected to avoid accidental global matches.
