import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['src/types/api.d.ts', '**/*.test.*', '**/test.*', '**/*.test.ts', '**/*.test.tsx'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  }
);
