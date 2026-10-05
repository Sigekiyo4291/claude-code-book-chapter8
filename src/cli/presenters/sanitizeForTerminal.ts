/* eslint-disable no-control-regex -- 制御文字を除去するための正規表現 */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;
// 改行(\n)とタブ(\t)以外の制御文字
const CONTROL_CHARACTERS_EXCEPT_NEWLINE_AND_TAB =
  /[\u0000-\u0008\u000B-\u001F\u007F]/g;
/* eslint-enable no-control-regex */

/**
 * 端末表示を改ざんし得る制御文字(エスケープシーケンス等)を除去する。
 *
 * @param allowMultiline - true の場合、改行とタブは残す(説明文の表示用)
 */
export function sanitizeForTerminal(
  text: string,
  allowMultiline = false
): string {
  return text.replace(
    allowMultiline
      ? CONTROL_CHARACTERS_EXCEPT_NEWLINE_AND_TAB
      : CONTROL_CHARACTERS,
    ''
  );
}
