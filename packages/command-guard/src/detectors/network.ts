import type { CommandDetector, CommandSignal } from "../types.js";

function isNetworkUpload(executable: string, argv: string[]): boolean {
  if (executable === "curl") {
    const curlUploadFlags = [
      "-d",
      "--data",
      "--data-raw",
      "--data-binary",
      "--data-urlencode",
      "-F",
      "--form",
      "--form-string",
      "-T",
      "--upload-file",
      "--json"
    ];
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg) continue;
      if (curlUploadFlags.includes(arg)) {
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
        if (firstChar === "d" || firstChar === "F" || firstChar === "T") {
          return true;
        }
      }
    }
  } else if (executable === "wget") {
    const wgetUploadFlags = ["--post-data", "--post-file"];
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (!arg) continue;
      if (wgetUploadFlags.includes(arg)) {
        return true;
      }
      if (arg.startsWith("--post-data=") || arg.startsWith("--post-file=")) {
        return true;
      }
    }
  }
  return false;
}

export const networkDetector: CommandDetector = (input) => {
  const { executable, command, argv } = input;
  const netDownloadExecs = ["curl", "wget"];
  const exfilExecs = ["nc", "netcat", "ncat", "scp", "rsync"];

  if (!netDownloadExecs.includes(executable) && !exfilExecs.includes(executable)) {
    return null;
  }

  const signals: CommandSignal[] = [];
  let suggestedRisk: "low" | "medium" | "high" = "medium";
  const tool = "network.exec";
  let category = "network_download";

  if (netDownloadExecs.includes(executable)) {
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
  } else if (exfilExecs.includes(executable)) {
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
