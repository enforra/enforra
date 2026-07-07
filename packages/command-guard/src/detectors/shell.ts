import type { CommandDetector, CommandSignal } from "../types.js";

export const shellDetector: CommandDetector = (input) => {
  const { executable, command } = input;
  const shellExecutables = ["sh", "bash", "zsh", "ksh", "csh", "tcsh", "fish", "dash"];
  const codeExecutables = [
    "node",
    "nodejs",
    "python",
    "python3",
    "python2",
    "ruby",
    "perl",
    "php",
    "deno"
  ];

  const pipeRuntimes = [
    "sh",
    "bash",
    "zsh",
    "ksh",
    "csh",
    "tcsh",
    "fish",
    "dash",
    "node",
    "nodejs",
    "python",
    "python3",
    "python2",
    "ruby",
    "perl",
    "php",
    "deno",
    "bun"
  ];
  const runtimeRegex = new RegExp(`\\|\\s*(${pipeRuntimes.join("|")})\\b`);
  const hasShellPipe = runtimeRegex.test(command);
  const isShell = shellExecutables.includes(executable);
  const isCodeExec = codeExecutables.includes(executable) || executable === "bun";

  if (!isShell && !hasShellPipe && !isCodeExec) {
    return null;
  }

  const signals: CommandSignal[] = [];
  let suggestedRisk: "low" | "medium" | "high" = "medium";
  let tool = "command.exec";
  let category = "unknown";

  if (isShell) {
    signals.push("shell_execution");
    tool = "shell.exec";
    category = "shell_command";
  }

  if (isCodeExec) {
    signals.push("code_execution");
    if (executable === "node" || executable === "nodejs") {
      tool = "node.exec";
      category = "code_execution";
    } else {
      tool = "command.exec";
      category = "code_execution";
    }
    suggestedRisk = "low";
  }

  const hasCurlOrWget = /\b(curl|wget)\b/.test(command);
  if (hasShellPipe && hasCurlOrWget) {
    if (!signals.includes("network_download")) signals.push("network_download");
    if (!signals.includes("download_and_execute")) signals.push("download_and_execute");
    if (!signals.includes("code_execution")) signals.push("code_execution");
    suggestedRisk = "high";
    category = "download_and_execute";
    tool = "network.exec";
  } else if (hasShellPipe) {
    if (!signals.includes("download_and_execute")) signals.push("download_and_execute");
    if (!signals.includes("code_execution")) signals.push("code_execution");
    suggestedRisk = "high";
    category = "download_and_execute";
  }

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["shell"]
  };
};
