import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: { include: ["tests/unit/*.test.ts", "tests/import/*.test.ts"], environment: "node", testTimeout: 30_000 }, // route tests import modules dynamically; the gate runs build/lint/tsc in parallel
});
