import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  // All tests share one user and board in the container.
  workers: 1,
  globalTeardown: "./tests/global-teardown.ts",
  use: {
    baseURL: "http://127.0.0.1:8001",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "docker compose -p pm-e2e -f ../docker-compose.yml up --build",
    url: "http://127.0.0.1:8001/api/health",
    env: { PORT: "8001" },
    reuseExistingServer: true,
    timeout: 600_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
