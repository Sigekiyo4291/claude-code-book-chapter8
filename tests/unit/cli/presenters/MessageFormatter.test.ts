import { describe, expect, it } from 'vitest';
import { MessageFormatter } from '../../../../src/cli/presenters/MessageFormatter.js';

describe('MessageFormatter', () => {
  const plain = new MessageFormatter(false);

  it('色なしの場合、記号とテキストのみで整形する', () => {
    expect(plain.success('完了')).toBe('✓ 完了\n');
    expect(plain.warning('注意')).toBe('⚠ 注意\n');
    expect(plain.info('情報')).toBe('情報\n');
    expect(plain.error('失敗', 'こうしてください')).toBe(
      '✗ 失敗\n  こうしてください\n'
    );
  });

  it('複数行のエラーメッセージは2行目以降をインデントする', () => {
    expect(plain.error('一行目\n二行目')).toBe('✗ 一行目\n  二行目\n');
  });

  it('色ありの場合、ANSI エスケープを含む', () => {
    expect(new MessageFormatter(true).success('完了')).toContain('\u001b[32m');
  });
});
