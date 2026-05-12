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
