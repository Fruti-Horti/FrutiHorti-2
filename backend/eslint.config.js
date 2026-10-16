const js = require('@eslint/js');
const globals = require('globals');
const { defineConfig, globalIgnores } = require('eslint/config');

module.exports = defineConfig([
  globalIgnores(['node_modules']),
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      // Tests destructure fields out of fixtures to build payloads without them.
      'no-unused-vars': ['error', { ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
    },
  },
]);
