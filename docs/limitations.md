# Limitations

This open source repository contains the local runtime core only. It does not include:

- Cloud dashboard
- Hosted audit retention
- Team approvals
- Auth
- Billing
- RBAC
- SSO
- Slack or email approvals
- Compliance reports
- Hosted API
- React UI
- Supabase, Postgres, or Redis
- Remote tool execution
- MCP gateway behavior

`require_approval` is a local decision. It does not execute the callback and does not contact an approval service.

This repository is focused on local runtime enforcement. Policy management, team workflows, and hosted audit retention are outside the scope of this OSS core.

For `allow` and `log_only`, audit logging happens before and after the local callback. If the pre-execution audit write fails, the callback is not run.
