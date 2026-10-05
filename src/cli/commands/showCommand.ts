import type { Command } from 'commander';
import type { CommandDependencies } from '../commandDependencies.js';
import { parseTaskId } from '../parseTaskId.js';
import { createTablePresenter } from '../presenters/TablePresenter.js';

export function registerShowCommand(
  program: Command,
  deps: CommandDependencies
): void {
  program
    .command('show')
    .description('タスクの詳細を表示します')
    .argument('<id>', 'タスクID(例: 1 または #1)')
    .action(async (rawId: string) => {
      const id = parseTaskId(rawId);
      const context = await deps.createContext();
      const task = await context.taskService.getTask(id);
      const presenter = await createTablePresenter(deps.output.color);
      deps.output.writeOut(presenter.renderTaskDetail(task));
    });
}
