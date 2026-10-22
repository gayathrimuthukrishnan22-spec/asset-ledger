import { defineConfig } from 'vitest/config';

// Load server/.env so TEST_BASE_URL / TEST_SERVICE_API_KEY can live there (Node 20.12+).
try { process.loadEnvFile('.env'); } catch { /* no .env - rely on real env vars */ }

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,      // Render free tier cold start / DB calls can take several seconds
    hookTimeout: 30_000,
    fileParallelism: false,   // tests write to the real DB - run one file at a time
    sequence: { concurrent: false }
  }
});
