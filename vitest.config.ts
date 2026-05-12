import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@enforra/policy-core": fileURLToPath(
        new URL("./packages/policy-core/src/index.ts", import.meta.url)
      ),
      "@enforra/local-audit": fileURLToPath(
        new URL("./packages/local-audit/src/index.ts", import.meta.url)
      ),
      "@enforra/sdk-node": fileURLToPath(
        new URL("./packages/sdk-node/src/index.ts", import.meta.url)
      )
    }
  }
});
