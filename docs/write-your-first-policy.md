# Write Your First Policy

Policies are local YAML files. They define which agent tool calls are allowed, blocked, logged, or marked as requiring approval.

The safest default is `block`.

## Complete Example

```yaml
version: 1
defaults:
  decision: block
policies:
  - id: allow-safe-read
    description: Allow safe customer lookups
    match:
      agent: support-agent
      tool: crm.lookup
    decision: allow

  - id: approve-risky-write
    description: Require approval before updating production records
    match:
      agent: support-agent
      tool: crm.update
    conditions:
      - field: context.environment
        operator: eq
        value: production
    decision: require_approval

  - id: block-destructive-action
    description: Block account deletion
    match:
      agent: support-agent
      tool: account.delete
    decision: block
```

## `match.agent`

Use `match.agent` to target one agent.

```yaml
match:
  agent: support-agent
```

If omitted, the rule can match any agent as long as another match field or condition is present.

## `match.tool`

Use `match.tool` to target one tool.

```yaml
match:
  tool: crm.lookup
```

Tool names are application-defined. Enforra does not require a specific naming scheme.

## Conditions

Conditions add structured checks against `args` or `context`.

```yaml
conditions:
  - field: args.amount
    operator: gt
    value: 50
  - field: args.amount
    operator: lte
    value: 500
```

Conditions are ANDed together. Every condition must match for the policy to match.

## Field Paths

Supported field path roots:

- `args.*`
- `context.*`

Examples:

- `args.amount`
- `args.recipient`
- `args.customerId`
- `context.environment`

Unknown fields do not match.

## Operators

Supported operators:

- `eq`
- `neq`
- `gt`
- `gte`
- `lt`
- `lte`
- `contains`
- `not_contains`

Numeric comparison operators require numeric input values.

`contains` and `not_contains` operate on string input values.

## First Matching Policy Wins

Policies are evaluated in order. The first matching policy wins.

Put more specific rules before broader rules.

```yaml
policies:
  - id: block-large-refunds
    match:
      tool: stripe.refund
    conditions:
      - field: args.amount
        operator: gt
        value: 500
    decision: block

  - id: approve-any-refund
    match:
      tool: stripe.refund
    decision: require_approval
```

In this example, refunds above 500 are blocked before the broader approval rule can match.

## Default Block Behavior

If no policy matches, Enforra uses `defaults.decision`.

```yaml
defaults:
  decision: block
```

If no default decision is provided, Enforra returns `block`.

## Empty Match Safety

A policy must include at least one of:

- `match.agent`
- `match.tool`
- `conditions`

This prevents accidental global allow rules.

## Use Your Policy

```ts
const enforra = await createEnforraClient({
  policyPath: "./policies/my-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});
```

The SDK is not hardcoded to starter policies. Starter policies are examples only.
