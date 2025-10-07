import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main.ts",
    preload: "src/preload.ts"
  },
  format: ["cjs"],
  target: "node18",
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: false,
  minify: false,
  skipNodeModulesBundle: true
});
