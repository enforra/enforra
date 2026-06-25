#!/usr/bin/env node
import { createMcpProxyFromEnv, serveMcpProxy } from "./proxy.js";

try {
  const { proxy, upstream } = await createMcpProxyFromEnv();
  await serveMcpProxy(proxy);

  const shutdown = (): void => {
    upstream.close();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`enforra-mcp-proxy: ${message}\n`);
  process.exit(1);
}
