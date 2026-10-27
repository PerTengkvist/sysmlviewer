import { defineConfig } from '@playwright/test'

/**
 * E2E layout evaluation. Runs the production bundle (frontend/dist) served by
 * the FastAPI backend on a dedicated port against a temp copy of examples/.
 *
 *   npm run e2e                       # all evaluation cases
 *   E2E_OUTPUT_DIR=e2e/output/baseline npm run e2e
 *   npm run e2e -- --grep physical    # subset
 */
const PORT = process.env.E2E_PORT || '5184'

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/server.mjs',
    url: `http://127.0.0.1:${PORT}/api/session`,
    timeout: 240_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
