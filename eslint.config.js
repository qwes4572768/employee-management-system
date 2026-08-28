const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: [
      'legacy-web/**',
      'node_modules/**',
      'dist/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'tests/**',
    ],
  },
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      'react-hooks/set-state-in-effect': 'off',
      '@typescript-eslint/array-type': 'off',
    },
  },
]);
