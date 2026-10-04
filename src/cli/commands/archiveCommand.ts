import type { Command } from 'commander';
import {
  createFormatter,
  type CommandDependencies,
} from '../commandDependencies.js';
import { parseTaskId } from '../parseTaskId.js';

export function registerArchiveCommand(
  program: Command,
  deps: CommandDependencies
): void {
  program
    .command('archive')
    .description('タスクをアーカイブし、一覧の表示対象から外します')
    .argument('<id>', 'タスクID(例: 1 または #1)')
    .action(async (rawId: string) => {
      const id = parseTaskId(rawId);
      const context = await deps.createContext();
      const task = await context.taskService.archiveTask(id);
      deps.output.writeOut(
        createFormatter(deps.output).success(
          `タスク #${task.id} をアーカイブしました`
        )
      );
    });
}
