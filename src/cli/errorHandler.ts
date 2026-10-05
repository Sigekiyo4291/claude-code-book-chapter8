import { TaskCliError } from '../domain/errors.js';
import type { Output } from './io/Output.js';
import { MessageFormatter } from './presenters/MessageFormatter.js';

export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;

/**
 * 例外をエラーメッセージとして標準エラー出力に表示し、終了コードを返す。
 *
 * @param debug - true の場合、予期しないエラーのスタックトレースを表示する
 */
export function handleError(
  error: unknown,
  output: Output,
  debug: boolean
): number {
  const formatter = new MessageFormatter(output.color);
  if (error instanceof TaskCliError) {
    output.writeErr(formatter.error(error.message, error.hint));
    return EXIT_FAILURE;
  }

  const message = error instanceof Error ? error.message : String(error);
  output.writeErr(
    formatter.error(
      `予期しないエラーが発生しました: ${message}`,
      'TASKCLI_DEBUG=1 を設定して再実行すると詳細を表示できます'
    )
  );
  if (debug && error instanceof Error && error.stack !== undefined) {
    output.writeErr(`${error.stack}\n`);
  }
  return EXIT_FAILURE;
}
