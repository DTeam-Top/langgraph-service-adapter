import { defineConfig, type Options } from "tsup";

export default defineConfig((options: Options) => ({
  ...options,
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  minify: false,
  external: ["@copilotkit/runtime", "@copilotkit/shared"],
  sourcemap: true,
  clean: true,
  exclude: [
    "**/*.test.ts", // Exclude TypeScript test files
    "**/__tests__/*", // Exclude any files inside a __tests__ directory
  ],
}));
