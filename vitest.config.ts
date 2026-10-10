import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // .tsx tests opt into a DOM with `// @vitest-environment jsdom`.
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
