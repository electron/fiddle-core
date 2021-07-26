const config = {
  env: {
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended'
  ],
  ignorePatterns: ['.eslintrc.js', 'jest.config.js', '/coverage'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: 'tsconfig.json',
  },
  rules: {
    // a la carte warnings
    'no-template-curly-in-string': 'error',
    '@typescript-eslint/no-non-null-assertion': 'off',
  }
}

module.exports = config;
