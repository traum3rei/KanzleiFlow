import { defineConfig, devices } from "@playwright/test";

if (process.env.KANZLEIFLOW_TEST_RUN !== "isolated") throw new Error("Use npm run test:e2e with the isolated database.");
export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1, timeout: 60_000,
  expect: { timeout: 15_000 }, reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: process.env.KANZLEIFLOW_PRODUCTION_E2E === "true" ? "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100" : "node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login", reuseExistingServer: false,
    timeout: 120_000, env: { ALLOW_DEMO_AUTH: "false" },
  },
});
