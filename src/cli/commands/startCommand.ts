import type { Command } from 'commander';
import {
  createFormatter,
  type CommandDependencies,
} from '../commandDependencies.js';
import { parseTaskId } from '../parseTaskId.js';

export function registerStartCommand(
  program: Command,
  deps: CommandDependencies
): void {
  program
    .command('start')
    .description('タスクを開始し、ブランチを作成して切り替えます')
    .argument('<id>', 'タスクID(例: 1 または #1)')
    .option('-b, --branch <name>', '作成・切り替えるブランチ名を指定します')
    .addHelpText(
      'after',
      '\n例:\n  task start 1                    # feature/task-1-<タイトル> を作成\n  task start 1 --branch fix/login # ブランチ名を指定'
    )
    .action(async (rawId: string, options: { branch?: string }) => {
      const id = parseTaskId(rawId);
      const context = await deps.createContext();
      const { task, branchAction } = await context.taskService.startTask(id, {
        branch: options.branch,
      });
      const formatter = createFormatter(deps.output);

      switch (branchAction) {
        case 'skipped_no_git':
          deps.output.writeErr(
            formatter.warning(
              'Gitリポジトリではないため、ブランチは作成されませんでした'
            )
          );
          deps.output.writeOut(
            formatter.success(`タスク #${task.id} を開始しました`)
          );
          return;
        case 'created':
          deps.output.writeOut(
            formatter.success(
              `タスク #${task.id} を開始しました(ブランチ: ${task.branch ?? ''})`
            )
          );
          return;
        case 'switched':
          deps.output.writeOut(
            formatter.success(
              `タスク #${task.id} を開始しました(既存のブランチ ${task.branch ?? ''} に切り替えました)`
            )
          );
          return;
      }
    });
}
