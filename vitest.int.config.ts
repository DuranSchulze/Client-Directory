import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: { include: ["tests/int/*.test.ts"], environment: "node", setupFiles: ["tests/int/setup.ts"], fileParallelism: false },
});
