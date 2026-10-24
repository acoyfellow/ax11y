import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: "esm",
  dts: true,
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
});
