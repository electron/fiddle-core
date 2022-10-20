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
  ignorePatterns: ['.eslintrc.js', 'jest.config.js', '/coverage', '/dist'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'es2018',
    lib: ['es2018'],
    project: './tsconfig.eslint.json',
    sourceType: 'module',
  },
  rules: {
    // a la carte warnings
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-template-curly-in-string': 'error',
  }
}

module.exports = config;
