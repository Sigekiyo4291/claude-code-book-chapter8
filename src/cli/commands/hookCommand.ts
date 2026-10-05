import type { Command } from 'commander';
import {
  createFormatter,
  type CommandDependencies,
} from '../commandDependencies.js';

export function registerHookCommand(
  program: Command,
  deps: CommandDependencies
): void {
  const hook = program
    .command('hook')
    .description(
      'コミットメッセージにタスク番号を追記する Git フックを管理します'
    );

  hook
    .command('install')
    .description('prepare-commit-msg フックをインストールします')
    .action(async () => {
      const context = await deps.createContext();
      const result = await context.hookService.install();
      const formatter = createFormatter(deps.output);
      deps.output.writeOut(
        result === 'installed'
          ? formatter.success('prepare-commit-msg フックをインストールしました')
          : formatter.info(
              'prepare-commit-msg フックは既にインストールされています'
            )
      );
    });

  hook
    .command('uninstall')
    .description('TaskCLI がインストールしたフックを削除します')
    .action(async () => {
      const context = await deps.createContext();
      const result = await context.hookService.uninstall();
      const formatter = createFormatter(deps.output);
      switch (result) {
        case 'uninstalled':
          deps.output.writeOut(formatter.success('フックを削除しました'));
          return;
        case 'not_installed':
          deps.output.writeOut(
            formatter.info('フックはインストールされていません')
          );
          return;
        case 'not_owned':
          deps.output.writeErr(
            formatter.warning(
              'prepare-commit-msg フックはTaskCLIが作成したものではないため、削除しませんでした'
            )
          );
          return;
      }
    });

  // Git の prepare-commit-msg フックから呼ばれる内部コマンド
  hook
    .command('run', { hidden: true })
    .argument('<messageFile>')
    .argument('[source]')
    .action(async (messageFile: string, source?: string) => {
      try {
        const context = await deps.createContext();
        await context.hookService.appendTaskTrailer(
          messageFile,
          source === '' ? undefined : source
        );
      } catch (error) {
        // フック内のエラーでコミットを妨げないよう、警告のみ表示して正常終了する
        const reason = error instanceof Error ? error.message : String(error);
        deps.output.writeErr(
          createFormatter(deps.output).warning(
            `TaskCLI: コミットメッセージにタスク番号を追記できませんでした(${reason})`
          )
        );
      }
    });
}
