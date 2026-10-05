import { describe, expect, it } from 'vitest';
import {
  matchesKeywords,
  normalizeForSearch,
  splitKeywords,
} from '../../../src/services/matchKeywords.js';

describe('normalizeForSearch', () => {
  it('全角英数字を半角に、大文字を小文字にそろえる', () => {
    expect(normalizeForSearch('ＡＰＩ設計 Ver２')).toBe('api設計 ver2');
  });
});

describe('splitKeywords', () => {
  it('半角・全角の空白で分割し、空要素を除く', () => {
    expect(splitKeywords('  ログイン　画面  API ')).toEqual([
      'ログイン',
      '画面',
      'api',
    ]);
  });

  it('空白のみの場合、空配列を返す', () => {
    expect(splitKeywords(' 　 ')).toEqual([]);
  });
});

describe('matchesKeywords', () => {
  const task = {
    title: 'ユーザー認証の実装',
    description: 'JWT を使った API 認証',
  };

  it('タイトルに含まれる場合、一致する', () => {
    expect(matchesKeywords(task, ['ユーザー'])).toBe(true);
  });

  it('説明に含まれる場合、一致する', () => {
    expect(matchesKeywords(task, ['jwt'])).toBe(true);
  });

  it('大文字小文字・全角半角を区別しない', () => {
    expect(matchesKeywords(task, splitKeywords('ＪＷＴ'))).toBe(true);
    expect(
      matchesKeywords({ title: 'ａｐｉ 設計' }, splitKeywords('API'))
    ).toBe(true);
  });

  it('すべてのキーワードを含む場合のみ一致する(AND)', () => {
    expect(matchesKeywords(task, ['認証', 'jwt'])).toBe(true);
    expect(matchesKeywords(task, ['認証', 'oauth'])).toBe(false);
  });

  it('キーワードがタイトルと説明にまたがっていても一致する', () => {
    expect(matchesKeywords(task, ['ユーザー', 'jwt'])).toBe(true);
  });

  it('半角カナと全角カナを区別しない', () => {
    expect(
      matchesKeywords({ title: 'ﾛｸﾞｲﾝ画面' }, splitKeywords('ログイン'))
    ).toBe(true);
  });

  it('説明がない場合はタイトルのみで判定する', () => {
    expect(matchesKeywords({ title: 'Initial setup' }, ['setup'])).toBe(true);
    expect(matchesKeywords({ title: 'Initial setup' }, ['undefined'])).toBe(
      false
    );
  });
});
