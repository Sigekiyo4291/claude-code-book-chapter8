import { TRAILER_KEY } from '../domain/Task.js';

const EXISTING_TRAILER_PATTERN = new RegExp(`^${TRAILER_KEY}: #\\d+\\s*$`, 'm');
const TRAILER_LINE_PATTERN = /^[A-Za-z0-9-]+: .+$/;
const COMMENT_PREFIX = '#';

/**
 * コミットメッセージの本文末尾に `Task: #<id>` トレーラーを追記する。
 *
 * - 既にタスクトレーラーがある場合は変更しない
 * - 本文が空の場合は変更しない(空メッセージによるコミット中止を妨げないため)
 * - git が付与するコメント行(`#` 始まり)は本文の後ろに残す
 * - 最終段落が既にトレーラー(`Key: value`)だけで構成されていれば、その末尾に続ける
 *
 * @returns 追記後のメッセージ。変更しない場合は元のメッセージ
 */
export function appendTrailer(message: string, taskId: number): string {
  if (EXISTING_TRAILER_PATTERN.test(message)) {
    return message;
  }

  const lines = message.replace(/\r\n/g, '\n').split('\n');
  const commentStart = findTrailingCommentStart(lines);
  const bodyLines = trimTrailingBlankLines(lines.slice(0, commentStart));
  if (bodyLines.length === 0) {
    return message;
  }

  const trailer = `${TRAILER_KEY}: #${taskId}`;
  const separator = endsWithTrailerBlock(bodyLines) ? [] : [''];
  const commentLines = trimTrailingBlankLines(lines.slice(commentStart));
  const result = [...bodyLines, ...separator, trailer];
  const firstCommentIndex = commentLines.findIndex(
    (line) => line.trim() !== ''
  );
  if (firstCommentIndex !== -1) {
    result.push('', ...commentLines.slice(firstCommentIndex));
  }
  return `${result.join('\n')}\n`;
}

/**
 * 末尾から見て、コメント行と空行だけが続く範囲の開始位置を返す。
 */
function findTrailingCommentStart(lines: string[]): number {
  let start = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    if (line.startsWith(COMMENT_PREFIX) || line.trim() === '') {
      start = i;
      continue;
    }
    break;
  }
  return start;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? '').trim() === '') {
    end--;
  }
  return lines.slice(0, end);
}

function endsWithTrailerBlock(bodyLines: string[]): boolean {
  let lastBlankIndex = -1;
  bodyLines.forEach((line, index) => {
    if (line.trim() === '') {
      lastBlankIndex = index;
    }
  });
  // 1段落しかない(件名のみ)場合はトレーラーブロックとみなさない
  if (lastBlankIndex === -1) {
    return false;
  }
  const lastParagraph = bodyLines.slice(lastBlankIndex + 1);
  return (
    lastParagraph.length > 0 &&
    lastParagraph.every((line) => TRAILER_LINE_PATTERN.test(line))
  );
}
