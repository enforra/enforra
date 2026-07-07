import {
  DEFAULT_SENSITIVE_PATHS,
  SENSITIVE_FILE_BASENAMES,
  SENSITIVE_DIRECTORY_NAMES,
  SENSITIVE_PROVIDER_PATHS
} from "../defaults.js";
import type { CommandDetector, CommandSignal } from "../types.js";

function isSensitivePathToken(token: string, extraSensitivePaths: string[]): boolean {
  if (!token) return false;

  const exactSensitive = [...DEFAULT_SENSITIVE_PATHS, ...extraSensitivePaths];

  if (exactSensitive.includes(token)) {
    return true;
  }

  // Split by path separator
  const segments = token.split(/[/\\]/);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;

    if (SENSITIVE_FILE_BASENAMES.includes(seg)) return true;
    if (SENSITIVE_DIRECTORY_NAMES.includes(seg)) return true;

    // Check specific provider path segment rules (e.g. passwd under etc)
    for (const rule of SENSITIVE_PROVIDER_PATHS) {
      if (seg === rule.name) {
        if (i > 0 && segments[i - 1] === rule.parent) {
          return true;
        }
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
