import type { Command } from 'commander';
import { ValidationError } from '../../domain/errors.js';
import {
  createFormatter,
  type CommandDependencies,
} from '../commandDependencies.js';
import { parseTaskId } from '../parseTaskId.js';
import { sanitizeForTerminal } from '../presenters/sanitizeForTerminal.js';

export function registerDeleteCommand(
  program: Command,
  deps: CommandDependencies
): void {
  program
    .command('delete')
    .alias('rm')
    .description('タスクを削除します(取り消せません)')
    .argument('<id>', 'タスクID(例: 1 または #1)')
    .option('-f, --force', '確認せずに削除します', false)
    .action(async (rawId: string, options: { force: boolean }) => {
      const id = parseTaskId(rawId);
      const context = await deps.createContext();
      const task = await context.taskService.getTask(id);
      const formatter = createFormatter(deps.output);

      if (!options.force) {
        const answer = await deps.prompt.confirm(
          `タスク #${task.id}「${sanitizeForTerminal(task.title)}」を削除しますか?`
        );
        if (answer === undefined) {
          // スクリプトから削除されなかったことを検知できるよう、エラーとして終了コード1にする
          throw new ValidationError(
            '確認できないため削除を中止しました',
            '確認なしで削除する場合は --force を指定してください'
          );
        }
        if (!answer) {
          deps.output.writeOut(formatter.info('削除をキャンセルしました'));
          return;
        }
      }

      await context.taskService.deleteTask(id);
      deps.output.writeOut(
        formatter.success(`タスク #${task.id} を削除しました`)
      );
    });
}
