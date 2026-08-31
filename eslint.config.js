import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'runner/dist',
      'docs',
      'playwright-report',
      'test-results',
      'public/sw.js',
      // Three.js distribution files are vendored browser artifacts, not application source.
      'public/lab/cherry-3d/vendor/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off', '@typescript-eslint/no-unused-vars': 'off' },
  },
  {
    files: ['runner/**', 'scripts/**', 'e2e/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // The stage wrapper is maintained as a browser custom element alongside the vendored build.
    files: ['public/lab/cherry-3d/three-d-stage.js'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': 'off',
    },
  },
);
