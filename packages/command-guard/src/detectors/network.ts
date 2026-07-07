import type { CommandDetector, CommandSignal } from "../types.js";

export const networkDetector: CommandDetector = (input) => {
  const { executable, command } = input;
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

    const isExfil =
      /curl\s+.*(-X\s+POST|-T|--upload-file)\b/.test(command) ||
      /wget\s+.*(--post-data|--post-file)\b/.test(command) ||
      command.includes("curl -X POST") ||
      command.includes("curl -T") ||
      command.includes("curl --upload-file");

    if (isExfil) {
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
