# Policy Language

Policy version 1 supports exact matches on `agent` and `tool`, numeric `amount` conditions, and generic field conditions over `args` and `context`.

```yaml
version: 1
defaults:
  decision: block
policies:
  - id: approve-production-shell
    match:
      agent: coding-agent
      tool: shell.run
      field_equals:
        field: environment
        value: production
    decision: require_approval
```

Supported decisions are `allow`, `block`, `require_approval`, and `log_only`.

Supported numeric conditions are `amount_gt`, `amount_gte`, `amount_lt`, and `amount_lte`.

Supported generic field conditions are `field_equals`, `field_not_equals`, `contains`, and `not_contains`.

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
    decision: allow

  - id: approve-production-write
    description: Require approval for production CRM updates
    match:
      agent: research-agent
      tool: crm.update
      field_equals:
        field: environment
        value: production
    decision: require_approval
```

If no policy matches, Enforra uses `defaults.decision`. If no default is configured, the decision is `block`.
