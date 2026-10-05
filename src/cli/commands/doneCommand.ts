import type { Command } from 'commander';
import {
  createFormatter,
  type CommandDependencies,
} from '../commandDependencies.js';
import { parseTaskId } from '../parseTaskId.js';

export function registerDoneCommand(
  program: Command,
  deps: CommandDependencies
): void {
  program
    .command('done')
    .description('タスクを完了にします')
    .argument('<id>', 'タスクID(例: 1 または #1)')
    .action(async (rawId: string) => {
      const id = parseTaskId(rawId);
      const context = await deps.createContext();
      const task = await context.taskService.completeTask(id);
      deps.output.writeOut(
        createFormatter(deps.output).success(
          `タスク #${task.id} を完了しました`
        )
      );
    });
}
