/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  settings: {
    react: {
      version: 'detect'
    }
  },
  plugins: ['react', 'react-hooks', '@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    // You’re using React 17+ / Vite, so React in scope isn’t required
    'react/react-in-jsx-scope': 'off',

    // You’re using TS types, so PropTypes are pointless
    'react/prop-types': 'off',

    // Don’t force explicit return types everywhere
    '@typescript-eslint/explicit-module-boundary-types': 'off',

    // By default, don’t block on unused vars during prototyping
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
    ]
  }
};
