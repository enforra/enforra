import { createHash } from "node:crypto";

/** Create a deterministic hash of a value using sorted keys. */
export function deterministicHash(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  const normalized = JSON.stringify(sortKeys(value));
  if (normalized === undefined) {
    return "";
  }
  return createHash("sha256").update(normalized).digest("hex");
}

function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}
