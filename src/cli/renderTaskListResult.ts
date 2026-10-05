import type { ListResult } from '../services/TaskService.js';
import { createFormatter } from './commandDependencies.js';
import type { CommandContext } from './context.js';
import type { Output } from './io/Output.js';
import { createTablePresenter } from './presenters/TablePresenter.js';

/**
 * task list / task search の結果を出力する。
 * 0件の場合は emptyMessage と、除外したアーカイブ済みタスクの案内を表示する。
 */
export async function renderTaskListResult(
  context: CommandContext,
  output: Output,
  result: ListResult,
  emptyMessage: string
): Promise<void> {
  if (result.tasks.length === 0) {
    const formatter = createFormatter(output);
    output.writeOut(formatter.info(emptyMessage));
    if (result.hiddenArchivedCount > 0) {
      output.writeOut(
        formatter.info(
          `(アーカイブ済みのタスクが ${result.hiddenArchivedCount} 件あります。--all で表示できます)`
        )
      );
    }
    return;
  }

  const [currentBranch, presenter] = await Promise.all([
    context.workspace.isGitRepository
      ? context.git.getCurrentBranch()
      : Promise.resolve(undefined),
    createTablePresenter(output.color),
  ]);
  output.writeOut(presenter.renderTaskList(result.tasks, { currentBranch }));
}
