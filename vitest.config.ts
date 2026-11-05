/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig reuses Astro's Vite setup (path alias "@/*", TypeScript), so tests
// resolve imports exactly like the app does.
export default getViteConfig({
  test: {
    // Test files live next to the code they cover: src/**/<name>.test.ts
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
