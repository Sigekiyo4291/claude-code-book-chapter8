import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../src/domain/errors.js';
import { parseTaskId } from '../../../src/cli/parseTaskId.js';

describe('parseTaskId', () => {
  it.each([
    ['1', 1],
    ['#12', 12],
    [' 3 ', 3],
  ])('"%s" を %i に変換する', (raw, expected) => {
    expect(parseTaskId(raw)).toBe(expected);
  });

  it.each(['0', '-1', 'abc', '1.5', '01', '#', '', '99999999999999999999'])(
    '"%s" の場合、ValidationError を送出する',
    (raw) => {
      expect(() => parseTaskId(raw)).toThrow(ValidationError);
    }
  );
});
