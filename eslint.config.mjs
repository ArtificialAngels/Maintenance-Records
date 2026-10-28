// Minimal ESLint flat config. Add typescript-eslint later when desired.
export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/data/**',
      '**/.vite/**',
      // scratch area: logs, pid files and one-off esbuild bundles live here
      '.run/**',
    ],
  },
  {
    rules: {
      'no-unused-vars': 'off', // we use _ prefix and TS handles this
    },
  },
];