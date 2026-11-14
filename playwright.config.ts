// Playwright — approved test tool (SPEC §1.5). Covers the M1 exit criterion
// E2E-01 (sign up → create trip → invite → second user joins) plus smoke
// checks that need no Supabase credentials.
//
// Base URL: http://localhost:3000 (nuxt dev) or override with E2E_BASE_URL.
// E2E-01 additionally needs SUPABASE_URL/SUPABASE_KEY (and ideally
// SUPABASE_SECRET_KEY for user cleanup) in .env — it is skipped otherwise.
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: 'tests/e2e',
  // The E2E-01 scenario is one ordered story across two users; run serially.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
