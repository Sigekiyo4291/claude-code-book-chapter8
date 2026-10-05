import type { Task } from '../domain/Task.js';

/**
 * 検索用に文字列を正規化する。全角英数字を半角に、大文字を小文字にそろえる。
 */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

/**
 * 検索キーワードを正規化し、空白で分割する(全角空白も区切りとして扱う)。
 */
export function splitKeywords(rawKeyword: string): string[] {
  return normalizeForSearch(rawKeyword)
    .split(/\s+/)
    .filter((keyword) => keyword !== '');
}

/**
 * すべてのキーワードがタイトルまたは説明に含まれるかを判定する。
 *
 * @param keywords - splitKeywords で正規化済みのキーワード
 */
export function matchesKeywords(
  task: Pick<Task, 'title' | 'description'>,
  keywords: readonly string[]
): boolean {
  // キーワードがタイトルと説明にまたがって一致してもよいよう、連結して判定する
  const searchableText = normalizeForSearch(
    `${task.title}\n${task.description ?? ''}`
  );
  return keywords.every((keyword) => searchableText.includes(keyword));
}
