import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../src/domain/errors.js';
import { parseStatusFilter } from '../../../src/cli/parseStatusFilter.js';

describe('parseStatusFilter', () => {
  it.each([
    ['in_progress', ['in_progress']],
    ['open,completed', ['open', 'completed']],
    [' open , archived ', ['open', 'archived']],
    ['open,open', ['open']],
    ['open,', ['open']],
  ])('"%s" を %j に変換する', (raw, expected) => {
    expect(parseStatusFilter(raw)).toEqual(expected);
  });

  it('不正なステータスの場合、有効な値をヒントにした ValidationError を送出する', () => {
    expect(() => parseStatusFilter('open,done')).toThrow(
      new ValidationError(
        '不正なステータスです: done',
        '有効な値: open, in_progress, completed, archived'
      )
    );
    expect(() => parseStatusFilter('Open')).toThrow(ValidationError);
  });

  it.each(['', ',', ' , '])(
    '"%s" の場合、ValidationError を送出する',
    (raw) => {
      expect(() => parseStatusFilter(raw)).toThrow(
        'ステータスを指定してください'
      );
    }
  );
});
