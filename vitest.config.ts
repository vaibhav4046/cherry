import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Several suites do genuinely heavy deterministic work - hashing large
    // archives, building oversized workspaces, decoding the shipped recording in
    // a real browser - and run in parallel workers that compete for CPU. At
    // 20000 those produced timeouts that always passed when run alone, which is
    // a false failure, not a caught defect. Assertions are unchanged.
    testTimeout: 60000,
  },
});
