import type { Command } from 'commander';
import {
  createFormatter,
  type CommandDependencies,
} from '../commandDependencies.js';

export function registerInitCommand(
  program: Command,
  deps: CommandDependencies
): void {
  program
    .command('init')
    .description('.task/ ディレクトリを作成し、タスク管理を初期化します')
    .action(async () => {
      const context = await deps.createContext();
      const result = await context.taskService.initialize();
      const formatter = createFormatter(deps.output);
      deps.output.writeOut(
        result === 'created'
          ? formatter.success(
              `.task/ を初期化しました(${context.workspace.dataDir})`
            )
          : formatter.info(
              `既に初期化されています(${context.workspace.dataDir})`
            )
      );
    });
}
