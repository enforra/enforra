// ─── Shell & Interpreter Defaults ──────────────────────────────────────────

export const SHELL_EXECUTABLES = ["sh", "bash", "zsh", "ksh", "csh", "tcsh", "fish", "dash"];

export const CODE_EXECUTABLES = [
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

export const PIPE_RUNTIMES = [
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

// ─── Secrets & Sensitive Path Defaults ──────────────────────────────────────

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

export const SENSITIVE_FILE_BASENAMES = [
  ".env",
  "id_rsa",
  "id_ed25519",
  ".npmrc",
  ".pypirc",
  "kubeconfig"
];

export const SENSITIVE_DIRECTORY_NAMES = [".ssh", ".aws", ".azure"];

export const SENSITIVE_PROVIDER_PATHS = [
  { name: "passwd", parent: "etc" },
  { name: "shadow", parent: "etc" },
  { name: "credentials", parent: "aws" },
  { name: "credentials", parent: ".aws" },
  { name: "gcloud", parent: ".config" }
];

// ─── Infrastructure Defaults ────────────────────────────────────────────────

export const DEFAULT_INFRA_COMMANDS = [
  "aws",
  "gcloud",
  "az",
  "kubectl",
  "docker",
  "ssh",
  "terraform",
  "helm"
];

export const INFRA_DELETE_OPERATIONS = ["delete", "destroy", "terminate", "rm"];

export const INFRA_WRITE_OPERATIONS = [
  "apply",
  "create",
  "update",
  "put",
  "set",
  "deploy",
  "rollback"
];

// ─── Network Defaults ───────────────────────────────────────────────────────

export const NETWORK_DOWNLOAD_EXECUTABLES = ["curl", "wget"];

export const EXTERNAL_TRANSFER_EXECUTABLES = ["nc", "netcat", "ncat", "scp", "rsync"];

export const CURL_UPLOAD_FLAGS = [
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

export const CURL_UPLOAD_SHORT_FLAGS = ["d", "F", "T"];

export const WGET_UPLOAD_FLAGS = ["--post-data", "--post-file"];

// ─── Files Defaults ─────────────────────────────────────────────────────────

export const FILE_READ_EXECUTABLES = ["cat", "less", "head", "tail", "more"];

export const FILE_DELETE_EXECUTABLES = ["rm", "rmdir"];

export const FILE_WRITE_EXECUTABLES = ["cp", "mv", "touch", "mkdir", "dd", "mkfs"];

export const SHELL_GLOBAL_DESTRUCTIVE_PATTERNS = ["rm -rf", "rm -fr", "dd if=", "mkfs"];

// ─── Package Manager Defaults ───────────────────────────────────────────────

export const PACKAGE_MANAGER_EXECUTABLES = ["npm", "pnpm", "yarn", "bun", "npx"];

export const PACKAGE_INSTALL_SUBCOMMANDS = ["install", "i", "add", "ci", "setup"];

export const PACKAGE_MUTATION_SUBCOMMANDS = [
  "uninstall",
  "remove",
  "rm",
  "prune",
  "update",
  "upgrade"
];

// ─── Git Defaults ───────────────────────────────────────────────────────────

export const GIT_READ_SUBCOMMANDS = ["clone", "pull", "fetch", "checkout", "diff", "log", "status"];

export const GIT_WRITE_SUBCOMMANDS = ["push", "commit", "add", "branch", "merge", "rebase", "tag"];

export const GIT_NETWORK_READ_SUBCOMMANDS = ["clone", "pull", "fetch"];

export const GIT_EXTERNAL_TRANSFER_SUBCOMMANDS = ["push"];

// ─── Privilege Defaults ───────────────────────────────────────────────────────

export const PRIVILEGE_EXECUTABLES = ["sudo", "su", "chown", "chmod"];

export const PRIVILEGE_COMMAND_TOKENS = ["sudo", "su", "chown"];

export const DANGEROUS_CHMOD_MODES = ["777", "a+w", "o+w"];
