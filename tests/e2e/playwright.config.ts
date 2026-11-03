import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

/**
 * End-to-end tests for the acceptance criterion:
 * create a project -> build a structure -> run a documented calculation ->
 * inspect the result and provenance -> export -> re-import and verify.
 *
 * The preview server builds the packages and the studio first, so the tests
 * exercise the production bundle rather than the dev server.
 *
 * Browser: locally the installed Chrome channel is used (no download); CI sets
 * PW_CHANNEL=chromium after `playwright install --with-deps chromium`.
 */
export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    channel: process.env.PW_CHANNEL ?? "chrome",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [{ name: "chrome" }],
  webServer: {
    command: "npm run build && npm run preview -w @hcs-materials/web -- --port 4173 --strictPort",
    cwd: repoRoot,
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
