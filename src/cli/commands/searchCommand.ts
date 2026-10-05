import type { Command } from 'commander';
import type { CommandDependencies } from '../commandDependencies.js';
import { parseStatusFilter } from '../parseStatusFilter.js';
import { sanitizeForTerminal } from '../presenters/sanitizeForTerminal.js';
import { renderTaskListResult } from '../renderTaskListResult.js';

export function registerSearchCommand(
  program: Command,
  deps: CommandDependencies
): void {
  program
    .command('search')
    .description(
      'タイトルまたは説明にキーワードを含むタスクを表示します(大文字小文字・全角半角を区別しません)'
    )
    .argument(
      '<keyword...>',
      '検索キーワード(空白区切りで複数指定するとすべてを含むタスクに一致)'
    )
    .option('-a, --all', 'アーカイブ済みのタスクも検索します', false)
    .option(
      '-s, --status <statuses>',
      '指定したステータスのタスクのみ検索します(カンマ区切りで複数指定)'
    )
    .addHelpText(
      'after',
      '\n例:\n  task search 認証\n  task search ログイン 画面 --status open'
    )
    .action(
      async (
        keywordWords: string[],
        options: { all: boolean; status?: string }
      ) => {
        const statuses =
          options.status === undefined
            ? undefined
            : parseStatusFilter(options.status);
        // クォートせずに複数語を渡された場合も1つの検索語として扱う
        const keyword = keywordWords.join(' ');
        const context = await deps.createContext();
        const result = await context.taskService.searchTasks(keyword, {
          includeArchived: options.all,
          statuses,
        });

        await renderTaskListResult(
          context,
          deps.output,
          result,
          `"${sanitizeForTerminal(keyword.trim())}" に一致するタスクはありません`
        );
      }
    );
}
