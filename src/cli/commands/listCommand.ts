import type { Command } from 'commander';
import {
  createFormatter,
  type CommandDependencies,
} from '../commandDependencies.js';
import { createTablePresenter } from '../presenters/TablePresenter.js';

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
    .action(async (options: { all: boolean }) => {
      const context = await deps.createContext();
      const [result, currentBranch] = await Promise.all([
        context.taskService.listTasks({ includeArchived: options.all }),
        context.workspace.isGitRepository
          ? context.git.getCurrentBranch()
          : Promise.resolve(undefined),
      ]);

      if (result.tasks.length === 0) {
        const formatter = createFormatter(deps.output);
        deps.output.writeOut(
          formatter.info(
            'タスクがありません。`task add "<タイトル>"` で追加できます'
          )
        );
        if (result.hiddenArchivedCount > 0) {
          deps.output.writeOut(
            formatter.info(
              `(アーカイブ済みのタスクが ${result.hiddenArchivedCount} 件あります。--all で表示できます)`
            )
          );
        }
        return;
      }

      const presenter = await createTablePresenter(deps.output.color);
      deps.output.writeOut(
        presenter.renderTaskList(result.tasks, { currentBranch })
      );
    });
}
