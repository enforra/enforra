export interface CapabilityRule {
  pattern: RegExp;
  capability: string;
}

export const CAPABILITY_RULES: CapabilityRule[] = [
  // shell (high risk code execution)
  {
    pattern: /(?:^|[^a-zA-Z])(terminal|shell|bash|exec|command|run|process|spawn)(?:$|[^a-zA-Z])/i,
    capability: "shell"
  },
  // delete (high risk data modification)
  {
    pattern: /(?:^|[^a-zA-Z])(delete|remove|destroy|wipe|drop|clear|purge)(?:$|[^a-zA-Z])/i,
    capability: "delete"
  },
  // write
  {
    pattern: /(?:^|[^a-zA-Z])(write|create|post|put|update|modify|set|save)(?:$|[^a-zA-Z])/i,
    capability: "write"
  },
  // read
  {
    pattern: /(?:^|[^a-zA-Z])(read|get|view|list|fetch|show|load)(?:$|[^a-zA-Z])/i,
    capability: "read"
  },
  // network
  {
    pattern: /(?:^|[^a-zA-Z])(network|http|fetch|request|api|url|curl|wget)(?:$|[^a-zA-Z])/i,
    capability: "network"
  },
  // database (e.g. database schema/tables)
  {
    pattern: /(?:^|[^a-zA-Z])(db|database|sql|table|collection)(?:$|[^a-zA-Z])/i,
    capability: "database"
  },
  // payment
  {
    pattern:
      /(?:^|[^a-zA-Z])(pay|payment|charge|refund|stripe|billing|checkout|invoice|card)(?:$|[^a-zA-Z])/i,
    capability: "payment"
  },
  // auth
  { pattern: /(?:^|[^a-zA-Z])(auth|login|jwt)(?:$|[^a-zA-Z])/i, capability: "auth" },
  // secret (credentials)
  {
    pattern: /(?:^|[^a-zA-Z])(secret|key|token|password|credential)(?:$|[^a-zA-Z])/i,
    capability: "secret"
  },
  // production
  {
    pattern: /(?:^|[^a-zA-Z])(prod|production|live|release|deploy|publish)(?:$|[^a-zA-Z])/i,
    capability: "production"
  },
  // external_side_effect
  {
    pattern:
      /(?:^|[^a-zA-Z])(email|mail|send|notify|notification|slack|webhook|sms)(?:$|[^a-zA-Z])/i,
    capability: "external_side_effect"
  }
];

/** Infer capabilities from a tool name and optional description. */
export function inferCapabilities(name: string, description?: string): string[] {
  const text = `${name} ${description ?? ""}`;
  const capabilities = new Set<string>();

  for (const { pattern, capability } of CAPABILITY_RULES) {
    if (pattern.test(text)) {
      capabilities.add(capability);
    }
  }

  return [...capabilities].sort();
}
