import type { CommandGuardOptions, NormalizedCommandGuardOptions } from "./types.js";

export function normalizeOptions(options?: CommandGuardOptions): NormalizedCommandGuardOptions {
  return {
    extraSensitivePaths: options?.extraSensitivePaths ?? [],
    extraInfraCommands: options?.extraInfraCommands ?? [],
    commandMappings: options?.commandMappings ?? [],
    extraDetectors: options?.extraDetectors ?? []
  };
}

export function parseArgv(argv: string[]) {
  const executable = argv[0] ?? "";
  const subcommand = argv[1] ?? "";
  const command = argv.join(" ");
  return {
    executable,
    subcommand,
    command,
    argv
  };
}
