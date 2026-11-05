import { defineConfig, devices } from '@playwright/test';

const HOST = '127.0.0.1';
// Not Astro's default 4321, which `pnpm dev` and a manual `pnpm preview` use.
const PORT = 4322;
const BASE_URL = `http://${HOST}:${PORT}`;

/**
 * End-to-end tests run against the production build served by `astro preview`.
 * Build first (`pnpm build`), then `pnpm test:e2e`. The first time on a machine,
 * install the browser: `pnpm exec playwright install chromium`.
 * Mobile-first: the only project is a 390 px wide phone viewport.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // A service worker would answer from its cache and hide the `page.route` rules of the other
    // specs; only `pwa.spec.ts` turns it on.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    // --ignore-lock keeps the server in the foreground and untracked. Without it,
    // Astro 7 detects AI agents, starts a background server and exits at once,
    // which Playwright would report as "webServer exited early".
    command: `pnpm preview --ignore-lock --host ${HOST} --port ${PORT}`,
    url: BASE_URL,
    // Never reuse a running server: a dev server would add the dev toolbar and
    // test the wrong thing. The tests must run against the production build.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
