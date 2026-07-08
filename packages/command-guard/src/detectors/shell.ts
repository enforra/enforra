import { SHELL_EXECUTABLES, CODE_EXECUTABLES, PIPE_RUNTIMES } from "../defaults.js";
import type { CommandDetector, CommandSignal } from "../types.js";

export const shellDetector: CommandDetector = (input) => {
  const { executable, command, argv } = input;

  const runtimeRegex = new RegExp(`\\|\\s*(${PIPE_RUNTIMES.join("|")})\\b`);
  const hasShellPipe = runtimeRegex.test(command);
  const isShell = SHELL_EXECUTABLES.includes(executable);
  const isCodeExec = CODE_EXECUTABLES.includes(executable) || executable === "bun";

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
      suggestedRisk = "low";

      // Look for inline evaluation payload
      let code: string | undefined;
      for (let i = 1; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg) continue;
        if (arg === "-e" || arg === "--eval" || arg === "-p" || arg === "--print") {
          if (i + 1 < argv.length) {
            code = argv[i + 1];
            break;
          }
        }
        if (arg.startsWith("-") && !arg.startsWith("--") && arg.length > 1) {
          if (arg.includes("e") || arg.includes("p")) {
            if (i + 1 < argv.length) {
              code = argv[i + 1];
              break;
            }
          }
        }
      }

      if (code) {
        if (code.includes("process.env")) {
          tool = "secrets.read";
          category = "secret_access";
          signals.push("secrets_read_attempt");
          suggestedRisk = "high";
        }
        if (code.includes("readFileSync") && code.includes("/etc/passwd")) {
          tool = "file.read";
          category = "file_access";
          signals.push("sensitive_file_read_attempt");
          suggestedRisk = "high";
        }
        if (code.includes("child_process")) {
          tool = "command.exec";
          category = "code_execution";
          signals.push("child_process_exec_attempt");
          suggestedRisk = "high";
        }
      }
    } else {
      tool = "command.exec";
      category = "code_execution";
      suggestedRisk = "low";
    }
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
