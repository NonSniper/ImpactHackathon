import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

export default defineConfig({
  testDir: "./tests",
  outputDir: join(tmpdir(), "credem-playwright-results"),
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5174", browserName: "chromium" },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    env: { VITE_GEOAPIFY_KEY: "playwright-example-key" },
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
