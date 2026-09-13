import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@pipeline": fileURLToPath(new URL("./pipeline/src", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { include: ["pipeline/test/**/*.test.ts", "src/**/*.test.ts"] },
});
