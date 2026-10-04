import { devNull } from 'node:os';
import { defineWorkspace } from 'vitest/config';

// 開発者の Git 設定(core.hooksPath 等)にテスト結果が左右されないようにする
const testEnv = {
  TZ: 'UTC',
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
};

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'core',
      include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
      env: testEnv,
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'e2e',
      include: ['tests/e2e/**/*.test.ts'],
      env: testEnv,
      testTimeout: 30_000,
    },
  },
]);
