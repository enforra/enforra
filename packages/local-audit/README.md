# @enforra/local-audit

Local JSONL audit logging with recursive redaction for Enforra.

## Usage

```ts
import { createLocalAuditLogger, verifyAuditLog } from "@enforra/local-audit";

const logger = createLocalAuditLogger(".enforra/audit.jsonl", {
  integrity: "hash_chain"
});

const verification = await verifyAuditLog(".enforra/audit.jsonl");
```

Hash-chain integrity is optional. Default audit logging does not add integrity metadata.
