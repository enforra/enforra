# Limitations

This repository contains the open-source local runtime core. It does not include the hosted Enforra Cloud application, cloud dashboard, hosted audit retention, team approval workflows, billing, SSO, or organization management.

`require_approval` is a local decision. It does not execute the callback and does not contact an approval service.

This repository is focused on the open-source local runtime. Policy management, team workflows, hosted audit retention, cloud dashboards, and organization-level controls belong in the optional hosted Enforra Cloud product.

For `allow` and `log_only`, audit logging happens before and after the local callback. If the pre-execution audit write fails, the callback is not run.
