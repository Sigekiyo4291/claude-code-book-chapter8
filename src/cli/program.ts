import { Command, CommanderError } from 'commander';
import type { CommandDependencies } from './commandDependencies.js';
import { registerAddCommand } from './commands/addCommand.js';
import { registerArchiveCommand } from './commands/archiveCommand.js';
import { registerDeleteCommand } from './commands/deleteCommand.js';
import { registerDoneCommand } from './commands/doneCommand.js';
import { registerHookCommand } from './commands/hookCommand.js';
import { registerInitCommand } from './commands/initCommand.js';
import { registerListCommand } from './commands/listCommand.js';
import { registerShowCommand } from './commands/showCommand.js';
import { registerStartCommand } from './commands/startCommand.js';
import { EXIT_FAILURE, EXIT_SUCCESS, handleError } from './errorHandler.js';
import { MessageFormatter } from './presenters/MessageFormatter.js';

export interface RunOptions extends CommandDependencies {
  version: string;
  debug: boolean;
}

/**
 * Commander の program を組み立てる。
 */
export function createProgram(options: RunOptions): Command {
  const formatter = new MessageFormatter(options.output.color);
  const program = new Command();

  program
    .name('task')
    .description('Gitと一体化した開発者向けタスク管理CLIツール')
    .version(options.version, '-v, --version', 'バージョンを表示します')
    .helpOption('-h, --help', 'ヘルプを表示します')
    .helpCommand('help [command]', 'コマンドのヘルプを表示します')
    .showSuggestionAfterError(true)
    .exitOverride()
    .configureOutput({
      writeOut: (text) => options.output.writeOut(text),
      writeErr: (text) => options.output.writeErr(text),
      outputError: (text, write) =>
        write(translateCommanderError(text, formatter)),
    })
    .addHelpText(
      'after',
      '\n基本の流れ:\n  task add "タイトル"  →  task start <id>  →  task done <id>'
    );

  // program.command() で作成したサブコマンドは、exitOverride と出力設定を自動で引き継ぐ
  for (const register of [
    registerInitCommand,
    registerAddCommand,
    registerListCommand,
    registerShowCommand,
    registerStartCommand,
    registerDoneCommand,
    registerArchiveCommand,
    registerDeleteCommand,
    registerHookCommand,
  ]) {
    register(program, options);
  }
  return program;
}

/**
 * CLI を実行し、終了コードを返す。
 *
 * @param argv - コマンド名を除いた引数(例: ['add', 'タイトル'])
 */
export async function run(
  argv: string[],
  options: RunOptions
): Promise<number> {
  const program = createProgram(options);
  try {
    await program.parseAsync(argv, { from: 'user' });
    return EXIT_SUCCESS;
  } catch (error) {
    if (error instanceof CommanderError) {
      // メッセージは outputError で表示済み。--help / --version は exitCode 0
      return error.exitCode === 0 ? EXIT_SUCCESS : EXIT_FAILURE;
    }
    return handleError(error, options.output, options.debug);
  }
}

const SUGGESTION_PATTERN = /\(Did you mean (.+)\?\)/;

/**
 * Commander の英語のエラーメッセージを、メッセージ + ヒント形式の日本語に変換する。
 */
export function translateCommanderError(
  text: string,
  formatter: MessageFormatter
): string {
  const suggestion = SUGGESTION_PATTERN.exec(text)?.[1]?.replace(
    /^one of /,
    ''
  );
  const suggestionHint =
    suggestion === undefined ? undefined : `もしかして: ${suggestion}`;

  const unknownCommand = /unknown command '([^']+)'/.exec(text);
  if (unknownCommand !== null) {
    return formatter.error(
      `不明なコマンドです: ${unknownCommand[1]}`,
      joinHints(suggestionHint, 'task --help でコマンド一覧を確認できます')
    );
  }

  const unknownOption = /unknown option '([^']+)'/.exec(text);
  if (unknownOption !== null) {
    return formatter.error(
      `不明なオプションです: ${unknownOption[1]}`,
      joinHints(
        suggestionHint,
        'task <command> --help でオプションを確認できます'
      )
    );
  }

  const missingArgument = /missing required argument '([^']+)'/.exec(text);
  if (missingArgument !== null) {
    return formatter.error(
      `必須の引数が指定されていません: ${missingArgument[1]}`,
      'task <command> --help で使い方を確認できます'
    );
  }

  const missingOptionValue = /option '([^']+)' argument missing/.exec(text);
  if (missingOptionValue !== null) {
    return formatter.error(
      `オプションの値が指定されていません: ${missingOptionValue[1]}`,
      'task <command> --help で使い方を確認できます'
    );
  }

  const tooManyArguments = /too many arguments/.test(text);
  if (tooManyArguments) {
    return formatter.error(
      '引数が多すぎます',
      '空白を含む値は "..." で囲んでください'
    );
  }

  return formatter.error(text.replace(/^error:\s*/, '').trim());
}

function joinHints(...hints: (string | undefined)[]): string {
  return hints.filter((hint) => hint !== undefined).join('\n  ');
}
