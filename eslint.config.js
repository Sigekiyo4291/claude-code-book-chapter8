import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

const LAYER_PATTERNS = {
  cli: ['**/cli/**'],
  services: ['**/services/**'],
  repositories: ['**/repositories/**'],
  infra: ['**/infra/**'],
};

const NODE_SIDE_EFFECT_MODULES = [
  'node:fs',
  'node:fs/*',
  'fs',
  'fs/*',
  'node:child_process',
  'child_process',
];

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ImportDeclaration[source.value=/child_process$/] ImportSpecifier[imported.name=/^exec(Sync)?$/]',
          message:
            'シェルを経由する exec / execSync は使用禁止です(コマンドインジェクション防止)',
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                ...LAYER_PATTERNS.cli,
                ...LAYER_PATTERNS.services,
                ...LAYER_PATTERNS.repositories,
                ...LAYER_PATTERNS.infra,
                'node:*',
                'commander',
                'simple-git',
                'string-width',
                'picocolors',
              ],
              message: 'domain は他のレイヤー・外部モジュールに依存できません',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/services/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: NODE_SIDE_EFFECT_MODULES.filter((name) => !name.includes('*')),
          patterns: [
            {
              group: [
                ...LAYER_PATTERNS.cli,
                ...LAYER_PATTERNS.repositories,
                ...LAYER_PATTERNS.infra,
                'node:fs/*',
                'fs/*',
                'simple-git',
                'commander',
              ],
              message:
                'services は ports.ts のインターフェース経由で外部にアクセスしてください',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/repositories/**/*.ts', 'src/infra/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [...LAYER_PATTERNS.cli],
              message: 'データ・インフラ層は CLI 層に依存できません',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/cli/**/*.ts'],
    ignores: ['src/cli/context.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [...LAYER_PATTERNS.repositories, ...LAYER_PATTERNS.infra],
              message:
                '具象クラスの組み立ては src/cli/context.ts でのみ行ってください',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/cli/io/Output.ts', 'src/cli/index.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.steering/**',
      '.claude/**',
    ],
  }
);
