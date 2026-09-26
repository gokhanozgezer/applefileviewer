// eslint.config.js (flat config — ESLint 9+)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // İgnore patterns
  {
    ignores: [
      '.claude/**',
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'release/**',
      'coverage/**',
      '.vite/**',
    ],
  },

  // Base
  js.configs.recommended,

  // TypeScript files
  ...tseslint.configs.recommended,

  // React
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { react: reactPlugin, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },

  // Genel kurallar
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['fs', 'node:fs', 'fs/promises', 'node:fs/promises'],
              message: "Doğrudan fs yasak. src/main/safeFs.ts gateway'i üzerinden geçin.",
            },
            {
              group: ['better-sqlite3'],
              message:
                'Doğrudan better-sqlite3 yasak. src/main/util/sqlite.ts#openReadOnlyTmp() üzerinden geçin.',
            },
          ],
        },
      ],
    },
  },

  // safeFs.ts ve test dosyalarında fs erişimi serbest
  {
    files: ['src/main/safeFs.ts', 'tests/**', 'src/main/util/sqlite.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // cache.ts userData/cache'e yazar (thumbnail/transcode) — safeFs kapsamı dışı.
  // safeFs backup-okuma + copyFileOut-dışarı; cache userData'ya yazma, farklı sorumluluk.
  // util/sqlite.ts ile aynı muamele: fs erişimi meşru, gateway zorunlu değil.
  {
    files: ['src/main/cache.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // scripts/ — Node.js CommonJS/ESM yardımcı scriptleri (build tooling, pretest)
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        exports: 'readonly',
      },
    },
  },
];
