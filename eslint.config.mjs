// Minimal ESLint flat config. Add typescript-eslint later when desired.
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/data/**', '**/.vite/**'],
  },
  {
    rules: {
      'no-unused-vars': 'off', // we use _ prefix and TS handles this
    },
  },
];