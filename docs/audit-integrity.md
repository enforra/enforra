# Audit Integrity

Enforra can optionally add hash-chain integrity metadata to local JSONL audit logs.

This mode is tamper-evident, not tamper-proof. A local attacker with filesystem access can rewrite the whole audit file. Hash-chain verification helps detect modified, deleted, or reordered events when the log is verified later.

## Enable Hash-Chain Mode

Hash-chain mode is off by default.

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl",
  auditIntegrity: "hash_chain"
});
```

The default remains:

```ts
const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl",
  auditIntegrity: "none"
});
```

## Event Metadata

When enabled, each audit event includes:

```json
{
  "integrity": {
    "algorithm": "sha256",
    "previousHash": null,
    "hash": "..."
  }
}
```

The first event has `previousHash: null`. Later events store the hash of the previous event.

Hashes are computed over a stable representation of the event plus the previous hash. The `hash` field itself is excluded from its own hash calculation.

## Verify a Log

Use `verifyAuditLog` from `@enforra/local-audit`:

```ts
import { verifyAuditLog } from "@enforra/local-audit";

const result = await verifyAuditLog(".enforra/audit.jsonl");

if (!result.valid) {
  console.error(result.firstInvalidLine, result.reason);
}
```

Result shape:

```ts
type AuditVerificationResult = {
  valid: boolean;
  eventsChecked: number;
  firstInvalidLine?: number;
  reason?: string;
};
```

## What Verification Detects

Verification detects:

- modified event content
- modified `previousHash`
- broken chain order
- invalid JSON lines
- missing integrity metadata in logs being verified as hash-chain logs

## What It Does Not Protect Against

Hash-chain mode does not provide:

- tamper-proof storage
- append-only filesystem guarantees
- HMAC signatures or secret-backed authenticity
- hosted retention
- log shipping
- protection if an attacker rewrites the entire file and all hashes

Use normal filesystem permissions and your own log retention system when stronger guarantees are required.

## Redaction vs Integrity

Redaction and integrity are separate controls.

Redaction avoids writing common sensitive values from `args`, `context`, and audit error messages.

Integrity metadata helps detect later changes to the local audit log. It does not remove sensitive data and does not replace redaction.

## Demo

```bash
pnpm demo:audit-integrity
```

The demo writes a hash-chain audit log and verifies it locally. It makes no external API calls.
