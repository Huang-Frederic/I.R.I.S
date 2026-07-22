import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // Honour the `_` prefix convention for intentionally-unused args/vars.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'next-env.d.ts',
    'env/**',
    // Python virtualenvs (e.g. vinted-agent/.venv from setup-mac.sh) bundle a
    // Node driver with thousands of .js files — never lint them.
    '**/.venv/**',
    '**/venv/**',
    'supabase/.temp/**',
  ]),
]);

export default eslintConfig;
