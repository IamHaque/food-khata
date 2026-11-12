import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      pool: "threads",
      isolate: true,
      fileParallelism: true,
      css: false,
      maxWorkers: 12,
      minWorkers: 6,
      disableConsoleIntercept: true,
      silent: true,
      setupFiles: ["./vitest.setup.ts"],
    },
  })
);
