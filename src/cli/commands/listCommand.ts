import type { Command } from 'commander';
import type { CommandDependencies } from '../commandDependencies.js';
import { parseStatusFilter } from '../parseStatusFilter.js';
import { renderTaskListResult } from '../renderTaskListResult.js';

export function registerListCommand(
  program: Command,
  deps: CommandDependencies
): void {
  program
    .command('list')
    .alias('ls')
    .description(
      'タスクの一覧を表示します(現在のブランチのタスクに * を付けます)'
    )
    .option('-a, --all', 'アーカイブ済みのタスクも表示します', false)
    .option(
      '-s, --status <statuses>',
      '指定したステータスのタスクのみ表示します(カンマ区切りで複数指定)'
    )
    .addHelpText(
      'after',
      '\n例:\n  task list --status in_progress\n  task list -s open,in_progress'
    )
    .action(async (options: { all: boolean; status?: string }) => {
      const statuses =
        options.status === undefined
          ? undefined
          : parseStatusFilter(options.status);
      const context = await deps.createContext();
      const result = await context.taskService.listTasks({
        includeArchived: options.all,
        statuses,
      });

      await renderTaskListResult(
        context,
        deps.output,
        result,
        statuses === undefined
          ? 'タスクがありません。`task add "<タイトル>"` で追加できます'
          : '条件に一致するタスクはありません'
      );
    });
}
