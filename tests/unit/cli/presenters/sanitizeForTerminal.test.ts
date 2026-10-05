import { describe, expect, it } from 'vitest';
import { sanitizeForTerminal } from '../../../../src/cli/presenters/sanitizeForTerminal.js';

describe('sanitizeForTerminal', () => {
  it('エスケープシーケンスなどの制御文字を除去する', () => {
    expect(sanitizeForTerminal('a\u001b[31mb\u0007c\u007f')).toBe('a[31mbc');
  });

  it('既定では改行とタブも除去する', () => {
    expect(sanitizeForTerminal('a\nb\tc')).toBe('abc');
  });

  it('allowMultiline の場合、改行とタブは残す', () => {
    expect(sanitizeForTerminal('a\nb\tc\u001b', true)).toBe('a\nb\tc');
  });
});
