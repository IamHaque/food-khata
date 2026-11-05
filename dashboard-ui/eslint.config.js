import tseslint from 'typescript-eslint';
export default tseslint.config(...tseslint.configs.recommended, { ignores: ['src/types/api.d.ts'] });
