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

export const secretsDetector: CommandDetector = (input) => {
  const { executable, command, options } = input;
  const isBareEnv = executable === "env" || executable === "printenv";

  // Combine default sensitive paths with user-configured extraSensitivePaths
  const sensitivePaths = [...DEFAULT_SENSITIVE_PATHS, ...options.extraSensitivePaths];
  const touchesSensitive = sensitivePaths.some((p) => command.includes(p));

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
