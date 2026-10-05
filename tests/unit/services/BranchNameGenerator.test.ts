import { describe, expect, it } from 'vitest';
import { InvalidBranchNameError } from '../../../src/domain/errors.js';
import {
  BranchNameGenerator,
  toSlug,
} from '../../../src/services/BranchNameGenerator.js';
import { FakeGit } from '../../helpers/fakes.js';

describe('BranchNameGenerator', () => {
  const generator = new BranchNameGenerator(new FakeGit());

  describe('generate', () => {
    it.each([
      [3, 'Initial setup', 'feature/task-3-initial-setup'],
      [1, 'ユーザー認証機能の実装', 'feature/task-1'],
      [5, 'OAuth2.0対応(Google)', 'feature/task-5-oauth2-0-google'],
      [7, 'Fix   bug!!  in  API', 'feature/task-7-fix-bug-in-api'],
      [8, 'ＡＢＣ１２３の修正', 'feature/task-8-abc123'],
      [9, '!!!', 'feature/task-9'],
      [10, '--leading and trailing--', 'feature/task-10-leading-and-trailing'],
    ])('ID %i・タイトル「%s」の場合、%s を生成する', (id, title, expected) => {
      expect(generator.generate(id, title)).toBe(expected);
    });

    it('スラッグが50文字を超える場合、50文字で切り詰めて末尾のハイフンを除去する', () => {
      const title = `${'a'.repeat(49)} bbbb`;

      const branch = generator.generate(1, title);

      expect(branch).toBe(`feature/task-1-${'a'.repeat(49)}`);
    });
  });

  describe('toSlug', () => {
    it('50文字ちょうどのスラッグはそのまま返す', () => {
      expect(toSlug('x'.repeat(50))).toHaveLength(50);
    });
  });

  describe('validate', () => {
    it('Gitで有効な名前の場合、例外を送出しない', async () => {
      await expect(
        generator.validate('fix/login-bug')
      ).resolves.toBeUndefined();
    });

    it.each(['', '-b', '--force', 'foo..bar', 'has space'])(
      '"%s" の場合、InvalidBranchNameError を送出する',
      async (name) => {
        await expect(generator.validate(name)).rejects.toThrow(
          InvalidBranchNameError
        );
      }
    );
  });
});
