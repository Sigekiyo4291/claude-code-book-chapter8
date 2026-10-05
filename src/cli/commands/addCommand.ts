import type { Command } from 'commander';
import {
  createFormatter,
  type CommandDependencies,
} from '../commandDependencies.js';
import { sanitizeForTerminal } from '../presenters/sanitizeForTerminal.js';

export function registerAddCommand(
  program: Command,
  deps: CommandDependencies
): void {
  program
    .command('add')
    .description('タスクを追加します')
    .argument('<title...>', 'タスクのタイトル(1〜200文字)')
    .option('-d, --description <text>', 'タスクの詳細説明')
    .addHelpText(
      'after',
      '\n例:\n  task add "ユーザー認証機能の実装"\n  task add "ログイン画面" -d "メールとパスワードでログイン"'
    )
    .action(async (titleWords: string[], options: { description?: string }) => {
      const context = await deps.createContext();
      const task = await context.taskService.createTask({
        // クォートせずに複数語を渡された場合も1つのタイトルとして扱う
        title: titleWords.join(' '),
        description: options.description,
      });
      deps.output.writeOut(
        createFormatter(deps.output).success(
          `タスク #${task.id} を作成しました: ${sanitizeForTerminal(task.title)}`
        )
      );
    });
}
