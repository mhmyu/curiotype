/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Tests that read the files of the production build (dist/). They live in tests/dist/ and run with
// `pnpm test:dist` after `pnpm build`; `pnpm test:run` (src/**) never needs dist/.
export default getViteConfig({
  test: {
    include: ['tests/dist/**/*.test.ts'],
    environment: 'node',
  },
});
