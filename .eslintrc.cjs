const config = {
  env: {
    node: true
  },
  plugins: ['import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended'
  ],
  ignorePatterns: ['.eslintrc.js', 'jest.config.js', '/coverage', '/dist'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.eslint.json',
    sourceType: 'module'
  },
  rules: {
    // a la carte warnings
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'import/enforce-node-protocol-usage': ['error', 'always'],
    'no-template-curly-in-string': 'error'
  }
}

module.exports = config;
