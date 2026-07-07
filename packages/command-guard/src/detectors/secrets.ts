import type { CommandDetector, CommandSignal } from "../types.js";

export const DEFAULT_SENSITIVE_PATHS = [
  "/etc/passwd",
  "/etc/shadow",
  "/root",
  "~/.ssh",
  ".ssh",
  "id_rsa",
  "id_ed25519",
  ".env",
  ".npmrc",
  ".pypirc",
  ".aws/credentials",
  "aws/credentials",
  "kubeconfig",
  "~/.aws",
  "~/.azure",
  "~/.config/gcloud"
];

function isSensitivePathToken(token: string, extraSensitivePaths: string[]): boolean {
  if (!token) return false;

  const exactSensitive = [
    "/etc/passwd",
    "/etc/shadow",
    "/root",
    "~/.ssh",
    ".ssh",
    "id_rsa",
    "id_ed25519",
    ".env",
    ".npmrc",
    ".pypirc",
    ".aws/credentials",
    "aws/credentials",
    "kubeconfig",
    "~/.aws",
    "~/.azure",
    "~/.config/gcloud",
    ...extraSensitivePaths
  ];

  if (exactSensitive.includes(token)) {
    return true;
  }

  // Split by path separator
  const segments = token.split(/[/\\]/);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;

    if (seg === ".env") return true;
    if (seg === "id_rsa") return true;
    if (seg === "id_ed25519") return true;
    if (seg === ".npmrc") return true;
    if (seg === ".pypirc") return true;
    if (seg === "kubeconfig") return true;
    if (seg === ".ssh") return true;
    if (seg === ".aws") return true;
    if (seg === ".azure") return true;

    // Check etc/passwd or etc/shadow
    if (seg === "passwd" || seg === "shadow") {
      if (i > 0 && segments[i - 1] === "etc") {
        return true;
      }
    }

    // Check credentials under aws/.aws
    if (seg === "credentials") {
      if (i > 0 && (segments[i - 1] === "aws" || segments[i - 1] === ".aws")) {
        return true;
      }
    }

    // Check gcloud under .config
    if (seg === "gcloud") {
      if (i > 0 && segments[i - 1] === ".config") {
        return true;
      }
    }
  }

  for (const p of extraSensitivePaths) {
    if (
      token === p ||
      token.startsWith(p + "/") ||
      token.startsWith(p + "\\") ||
      token.endsWith(p)
    ) {
      return true;
    }
  }

  return false;
}

function containsSensitivePath(
  command: string,
  argv: string[],
  extraSensitivePaths: string[]
): boolean {
  for (const token of argv) {
    if (isSensitivePathToken(token, extraSensitivePaths)) {
      return true;
    }
  }
  const tokens = command.split(/\s+/);
  for (const token of tokens) {
    const cleanToken = token.replace(/^['"]|['"]$/g, "");
    if (isSensitivePathToken(cleanToken, extraSensitivePaths)) {
      return true;
    }
  }
  return false;
}

export const secretsDetector: CommandDetector = (input) => {
  const { executable, command, argv, options } = input;
  const isBareEnv = executable === "env" || executable === "printenv";

  const touchesSensitive = containsSensitivePath(command, argv, options.extraSensitivePaths);

  const shellExecs = ["sh", "bash", "zsh", "ksh", "csh", "tcsh", "fish", "dash"];
  const hasSubEnv = shellExecs.includes(executable) && /\benv\b/.test(command);

  if (!isBareEnv && !touchesSensitive && !hasSubEnv) {
    return null;
  }

  const signals: CommandSignal[] = [];
  let suggestedRisk: "low" | "medium" | "high" = "medium";
  let tool = "secrets.read";
  let category = "secret_access";

  if (isBareEnv) {
    signals.push("environment_read", "secret_read");
    suggestedRisk = "high";
  } else if (hasSubEnv) {
    signals.push("environment_read", "secret_read");
    suggestedRisk = "high";
  }

  if (touchesSensitive) {
    signals.push("sensitive_path_access", "secret_read");
    suggestedRisk = "high";
    // For command like cat .env, we make it secrets.read
    if (["cat", "less", "head", "tail", "more"].includes(executable)) {
      tool = "secrets.read";
      category = "secret_access";
    }
  }

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["secrets"]
  };
};
