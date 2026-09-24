import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import eslintComments from 'eslint-plugin-eslint-comments';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tailwind from 'eslint-plugin-tailwindcss';
import globals from 'globals';

/**
 * ESLint flat config. Reproduces the rule set the React Router app got from
 * `eslint-plugin-hydrogen` (recommended + typescript), which only supports
 * Hydrogen on React Router, plus this repo's own overrides.
 */
export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'build/**',
      'dist/**',
      '**/*.d.ts',
      '**/*.graphql.ts',
    ],
  },
  js.configs.recommended,
  react.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  ...tailwind.configs['flat/recommended'],
  prettierRecommended,
  {
    plugins: {
      'eslint-comments': eslintComments,
      'react-hooks': reactHooks,
      import: importPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {ecmaFeatures: {jsx: true}},
      globals: {...globals.browser, ...globals.node, ...globals.es2021},
    },
    settings: {react: {version: 'detect'}},
    rules: {
      ...eslintComments.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'eslint-comments/no-unused-disable': 'error',
      'jsx-a11y/control-has-associated-label': 'off',
      'jsx-a11y/label-has-for': 'off',
      'no-use-before-define': 'off',
      'no-warning-comments': 'off',
      'object-shorthand': ['error', 'always', {avoidQuotes: true}],
      'react/display-name': 'off',
      'react/react-in-jsx-scope': 'off',

      // Repo overrides (from the previous .eslintrc.cjs)
      'no-console': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react/forbid-prop-types': 'off',
      'react/no-array-index-key': 'off',
      'react/prop-types': 'off',
      'react/require-default-props': 'off',
      'no-useless-escape': 'off',
      'no-case-declarations': 'off',
      'no-empty': 'off',
      'tailwindcss/no-custom-classname': [
        'warn',
        {whitelist: ['theme-\\S+', 'embla-\\S+']},
      ],
      /**
       * Keep imports grouped by distance from the current file:
       * builtin, external, `~/` internal, parent, sibling.
       */
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
          pathGroups: [{pattern: '~/**', group: 'internal'}],
          'newlines-between': 'always',
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {parser: tsParser},
    plugins: {'@typescript-eslint': tsPlugin},
    rules: {
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      // TypeScript already checks undefined identifiers
      'no-undef': 'off',
      'no-redeclare': 'off',
    },
  },
  {
    files: ['**/*.server.*', 'src/lib/server/**', 'src/app/**/route.ts'],
    rules: {'react-hooks/rules-of-hooks': 'off'},
  },
];
