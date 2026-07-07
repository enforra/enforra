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

  const hasShellPipe = /\|\s*(sh|bash|zsh|ksh|csh|tcsh|fish|dash)\b/.test(command);
  const isShell = shellExecutables.includes(executable);
  const isCodeExec = codeExecutables.includes(executable);

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
    signals.push("network_download", "download_and_execute", "code_execution");
    suggestedRisk = "high";
    category = "download_and_execute";
  } else if (hasShellPipe) {
    signals.push("download_and_execute", "code_execution");
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
