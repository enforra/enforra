import {
  NETWORK_DOWNLOAD_EXECUTABLES,
  EXTERNAL_TRANSFER_EXECUTABLES,
  CURL_UPLOAD_FLAGS,
  CURL_UPLOAD_SHORT_FLAGS,
  WGET_UPLOAD_FLAGS
} from "../defaults.js";
import type { CommandDetector, CommandSignal } from "../types.js";

function isNetworkUpload(executable: string, argv: string[]): boolean {
  if (executable === "curl") {
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg) continue;
      if (CURL_UPLOAD_FLAGS.includes(arg)) {
        return true;
      }
      if (arg === "-X" || arg === "--request") {
        if (i + 1 < argv.length && argv[i + 1]?.toUpperCase() === "POST") {
          return true;
        }
      }
      // Also match compound single-dash flags or direct values, e.g. -Ffile=@... or -d...
      if (arg.startsWith("-") && !arg.startsWith("--")) {
        const firstChar = arg[1];
        if (firstChar && CURL_UPLOAD_SHORT_FLAGS.includes(firstChar)) {
          return true;
        }
      }
    }
  } else if (executable === "wget") {
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg) continue;
      if (WGET_UPLOAD_FLAGS.includes(arg)) {
        return true;
      }
      for (const flag of WGET_UPLOAD_FLAGS) {
        if (arg.startsWith(flag + "=")) {
          return true;
        }
      }
    }
  }
  return false;
}

export const networkDetector: CommandDetector = (input) => {
  const { executable, command, argv } = input;

  if (
    !NETWORK_DOWNLOAD_EXECUTABLES.includes(executable) &&
    !EXTERNAL_TRANSFER_EXECUTABLES.includes(executable)
  ) {
    return null;
  }

  const signals: CommandSignal[] = [];
  let suggestedRisk: "low" | "medium" | "high" = "medium";
  const tool = "network.exec";
  let category = "network_download";

  if (NETWORK_DOWNLOAD_EXECUTABLES.includes(executable)) {
    signals.push("network_download");

    const hasStringUpload =
      /curl\b.*\s(-X\s+POST|--request\s+POST|-d|--data|--data-raw|--data-binary|--data-urlencode|-F|--form|--form-string|-T|--upload-file|--json)\b/.test(
        command
      ) ||
      /wget\b.*\s(--post-data|--post-file)\b/.test(command) ||
      command.includes("curl -X POST") ||
      command.includes("curl -T") ||
      command.includes("curl --upload-file") ||
      command.includes("curl -d") ||
      command.includes("curl -F") ||
      command.includes("wget --post-data") ||
      command.includes("wget --post-file");

    const isUpload = isNetworkUpload(executable, argv) || hasStringUpload;

    if (isUpload) {
      signals.push("external_transfer");
      category = "external_transfer";
      suggestedRisk = "high";
    }
  } else if (EXTERNAL_TRANSFER_EXECUTABLES.includes(executable)) {
    signals.push("external_transfer");
    category = "external_transfer";
    suggestedRisk = "high";
  }

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["network"]
  };
};
