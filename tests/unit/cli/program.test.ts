import { describe, expect, it } from 'vitest';
import type { CommandContext } from '../../../src/cli/context.js';
import { createBufferedOutput } from '../../../src/cli/io/Output.js';
import { run, translateCommanderError } from '../../../src/cli/program.js';
import { MessageFormatter } from '../../../src/cli/presenters/MessageFormatter.js';
import type { Task } from '../../../src/domain/Task.js';
import { BranchNameGenerator } from '../../../src/services/BranchNameGenerator.js';
import { CommitHookService } from '../../../src/services/CommitHookService.js';
import { StatusTransitionPolicy } from '../../../src/services/StatusTransitionPolicy.js';
import { TaskService } from '../../../src/services/TaskService.js';
import {
  FakeGit,
  FixedClock,
  InMemoryTaskRepository,
  InMemoryTextFiles,
  type FakeGitOptions,
} from '../../helpers/fakes.js';
import { buildTask } from '../../helpers/taskFactory.js';

interface Setup {
  tasks?: Task[];
  git?: FakeGitOptions;
  isGitRepository?: boolean;
  answer?: boolean;
  files?: Record<string, string>;
}

function setup(options: Setup = {}) {
  const repository = new InMemoryTaskRepository(options.tasks ?? []);
  const git = new FakeGit({ hooksDir: '/repo/.git/hooks', ...options.git });
  const files = new InMemoryTextFiles(options.files);
  const isGitRepository = options.isGitRepository ?? true;
  const workspace = {
    rootDir: '/repo',
    dataDir: '/repo/.task',
    isGitRepository,
  };
  const taskService = new TaskService({
    repository,
    git,
    workspace,
    policy: new StatusTransitionPolicy(),
    branchNameGenerator: new BranchNameGenerator(git),
    clock: new FixedClock(),
  });
  const context: CommandContext = {
    workspace,
    taskService,
    git,
    hookService: new CommitHookService({
      git,
      files,
      taskService,
      isGitRepository,
    }),
  };
  const output = createBufferedOutput();
  const prompts: string[] = [];
  const execute = (...argv: string[]) =>
    run(argv, {
      output,
      prompt: {
        confirm: async (message) => {
          prompts.push(message);
          return options.answer;
        },
      },
      createContext: async () => context,
      version: '1.2.3',
      debug: false,
    });
  return { execute, output, repository, git, files, prompts };
}

describe('run', () => {
  describe('ヘルプ・バージョン', () => {
    it('--version でバージョンを表示し 0 を返す', async () => {
      const { execute, output } = setup();

      expect(await execute('--version')).toBe(0);
      expect(output.stdout).toBe('1.2.3\n');
    });

    it('--help で全コマンドを表示し 0 を返す', async () => {
      const { execute, output } = setup();

      expect(await execute('--help')).toBe(0);
      for (const command of [
        'init',
        'add',
        'list',
        'search',
        'show',
        'start',
        'done',
        'archive',
        'delete',
        'hook',
      ]) {
        expect(output.stdout).toContain(command);
      }
      expect(output.stdout).not.toContain('run');
    });

    it('サブコマンドの --help で使用例を表示する', async () => {
      const { execute, output } = setup();

      expect(await execute('add', '--help')).toBe(0);
      expect(output.stdout).toContain('task add "ユーザー認証機能の実装"');
    });

    it('不明なコマンドの場合、類似コマンドを提案し 1 を返す', async () => {
      const { execute, output } = setup();

      expect(await execute('lst')).toBe(1);
      expect(output.stderr).toContain('✗ 不明なコマンドです: lst');
      expect(output.stderr).toContain('もしかして: list');
    });
  });

  describe('init', () => {
    it('初期化結果を表示する', async () => {
      const { execute, output } = setup();

      await execute('init');
      await execute('init');

      expect(output.stdout).toContain('✓ .task/ を初期化しました(/repo/.task)');
      expect(output.stdout).toContain('既に初期化されています');
    });
  });

  describe('add', () => {
    it('タスクを作成し、クォートなしの複数語を1つのタイトルとして扱う', async () => {
      const { execute, output, repository } = setup();

      expect(await execute('add', 'Initial', 'setup', '-d', '説明')).toBe(0);

      expect(output.stdout).toBe('✓ タスク #1 を作成しました: Initial setup\n');
      expect(repository.store.tasks[0]?.description).toBe('説明');
    });

    it('タイトルが空の場合、エラーを表示し 1 を返す', async () => {
      const { execute, output } = setup();

      expect(await execute('add', '')).toBe(1);
      expect(output.stderr).toContain('タイトルは1〜200文字');
    });
  });

  describe('list', () => {
    it('タスクがない場合、追加方法を案内する', async () => {
      const { execute, output } = setup();

      await execute('list');

      expect(output.stdout).toBe(
        'タスクがありません。`task add "<タイトル>"` で追加できます\n'
      );
    });

    it('アーカイブ済みのみの場合、件数と --all を案内する', async () => {
      const { execute, output } = setup({
        tasks: [buildTask({ id: 1, status: 'archived' })],
      });

      await execute('list');

      expect(output.stdout).toContain('アーカイブ済みのタスクが 1 件あります');
    });

    it('現在のブランチのタスクに * を付けて表示し、--all でアーカイブ済みも表示する', async () => {
      const { execute, output } = setup({
        tasks: [
          buildTask({ id: 1, branch: 'feature/task-1' }),
          buildTask({ id: 2, status: 'archived', title: 'old' }),
        ],
        git: { currentBranch: 'feature/task-1' },
      });

      await execute('list');
      expect(output.stdout).toContain('* 1');
      expect(output.stdout).not.toContain('old');

      await execute('ls', '--all');
      expect(output.stdout).toContain('old');
    });

    it('Gitリポジトリ外では現在のブランチを参照しない', async () => {
      const { execute, output } = setup({
        tasks: [buildTask({ id: 1, branch: 'feature/task-1' })],
        git: { currentBranch: 'feature/task-1' },
        isGitRepository: false,
      });

      await execute('list');

      expect(output.stdout).not.toContain('* 1');
    });

    it('--status で指定したステータスのタスクのみ表示する', async () => {
      const { execute, output } = setup({
        tasks: [
          buildTask({ id: 1, title: 'open task' }),
          buildTask({ id: 2, title: 'doing', status: 'in_progress' }),
          buildTask({ id: 3, title: 'old', status: 'archived' }),
        ],
      });

      expect(await execute('list', '--status', 'in_progress')).toBe(0);
      expect(output.stdout).toContain('doing');
      expect(output.stdout).not.toContain('open task');

      expect(await execute('list', '-s', 'archived')).toBe(0);
      expect(output.stdout).toContain('old');
    });

    it('--status で該当がない場合、条件に一致しない旨を表示する', async () => {
      const { execute, output } = setup({
        tasks: [buildTask({ id: 1 })],
      });

      expect(await execute('list', '--status', 'completed')).toBe(0);
      expect(output.stdout).toBe('条件に一致するタスクはありません\n');
    });

    it('不正なステータスの場合、有効な値を案内し 1 を返す', async () => {
      const { execute, output } = setup();

      expect(await execute('list', '--status', 'done')).toBe(1);
      expect(output.stderr).toContain('✗ 不正なステータスです: done');
      expect(output.stderr).toContain(
        '有効な値: open, in_progress, completed, archived'
      );
    });
  });

  describe('search', () => {
    const tasks = [
      buildTask({ id: 1, title: 'ユーザー認証', branch: 'feature/task-1' }),
      buildTask({ id: 2, title: 'ログイン画面', description: 'API 認証' }),
      buildTask({ id: 3, title: '認証ログ', status: 'archived' }),
      buildTask({ id: 4, title: 'README 更新' }),
    ];

    it('キーワードに一致するタスクを表で表示し、現在のブランチに * を付ける', async () => {
      const { execute, output } = setup({
        tasks,
        git: { currentBranch: 'feature/task-1' },
      });

      expect(await execute('search', '認証')).toBe(0);

      expect(output.stdout).toContain('* 1');
      expect(output.stdout).toContain('ログイン画面');
      expect(output.stdout).not.toContain('認証ログ');
      expect(output.stdout).not.toContain('README');
    });

    it('クォートなしの複数語を AND 条件で検索し、--status と併用できる', async () => {
      const { execute, output } = setup({ tasks });

      expect(await execute('search', 'api', '認証', '-s', 'open')).toBe(0);

      expect(output.stdout).toContain('ログイン画面');
      expect(output.stdout).not.toContain('ユーザー認証');
    });

    it('--all でアーカイブ済みも検索する', async () => {
      const { execute, output } = setup({ tasks });

      await execute('search', '認証ログ', '--all');

      expect(output.stdout).toContain('認証ログ');
    });

    it('一致しない場合、キーワードと除外したアーカイブ済みの件数を案内する', async () => {
      const { execute, output } = setup({ tasks });

      expect(await execute('search', 'ログ')).toBe(0);
      expect(output.stdout).toContain('ログイン画面');

      expect(await execute('search', '認証ログ')).toBe(0);
      expect(output.stdout).toContain(
        '"認証ログ" に一致するタスクはありません'
      );
      expect(output.stdout).toContain('アーカイブ済みのタスクが 1 件あります');
    });

    it('キーワードが空白のみの場合、1 を返す', async () => {
      const { execute, output } = setup({ tasks });

      expect(await execute('search', ' ')).toBe(1);
      expect(await execute('search', '')).toBe(1);
      expect(output.stderr).toContain('検索キーワードを指定してください');
    });

    it('キーワードがない場合、1 を返す', async () => {
      const { execute, output } = setup();

      expect(await execute('search')).toBe(1);
      expect(output.stderr).toContain('必須の引数が指定されていません');
    });
  });

  describe('show', () => {
    it('タスクの詳細を表示する', async () => {
      const { execute, output } = setup({ tasks: [buildTask({ id: 1 })] });

      expect(await execute('show', '#1')).toBe(0);
      expect(output.stdout).toContain('タスク #1');
    });

    it('不正なIDの場合、1 を返す', async () => {
      const { execute, output } = setup();

      expect(await execute('show', 'abc')).toBe(1);
      expect(output.stderr).toContain(
        'タスクIDは正の整数で指定してください: abc'
      );
    });
  });

  describe('start', () => {
    it('ブランチを作成した場合、ブランチ名を表示する', async () => {
      const { execute, output } = setup({
        tasks: [buildTask({ id: 1, title: 'Login' })],
      });

      expect(await execute('start', '1')).toBe(0);
      expect(output.stdout).toBe(
        '✓ タスク #1 を開始しました(ブランチ: feature/task-1-login)\n'
      );
    });

    it('既存のブランチに切り替えた場合、その旨を表示する', async () => {
      const { execute, output } = setup({
        tasks: [buildTask({ id: 1, title: 'Login' })],
        git: { branches: ['feature/task-1-login'] },
      });

      await execute('start', '1');

      expect(output.stdout).toContain(
        '既存のブランチ feature/task-1-login に切り替えました'
      );
    });

    it('--branch で指定したブランチを使う', async () => {
      const { execute, git } = setup({ tasks: [buildTask({ id: 1 })] });

      await execute('start', '1', '--branch', 'fix/login');

      expect(git.currentBranch).toBe('fix/login');
    });

    it('Gitリポジトリ外の場合、警告を表示して開始する', async () => {
      const { execute, output } = setup({
        tasks: [buildTask({ id: 1 })],
        isGitRepository: false,
      });

      expect(await execute('start', '1')).toBe(0);
      expect(output.stderr).toContain(
        '⚠ Gitリポジトリではないため、ブランチは作成されませんでした'
      );
      expect(output.stdout).toBe('✓ タスク #1 を開始しました\n');
    });

    it('Git操作に失敗した場合、Gitのエラー内容とヒントを表示し 1 を返す', async () => {
      const { execute, output, repository } = setup({
        tasks: [buildTask({ id: 1 })],
        git: { failCheckout: true },
      });

      expect(await execute('start', '1')).toBe(1);
      expect(output.stderr).toContain(
        'Your local changes would be overwritten'
      );
      expect(repository.store.tasks[0]?.status).toBe('open');
    });
  });

  describe('done / archive', () => {
    it('完了・アーカイブの結果を表示する', async () => {
      const { execute, output } = setup({ tasks: [buildTask({ id: 1 })] });

      await execute('done', '1');
      await execute('archive', '1');

      expect(output.stdout).toBe(
        '✓ タスク #1 を完了しました\n✓ タスク #1 をアーカイブしました\n'
      );
    });
  });

  describe('delete', () => {
    it('確認で同意した場合、削除する', async () => {
      const { execute, output, repository, prompts } = setup({
        tasks: [buildTask({ id: 1, title: '消すタスク' })],
        answer: true,
      });

      expect(await execute('delete', '1')).toBe(0);
      expect(prompts).toEqual(['タスク #1「消すタスク」を削除しますか?']);
      expect(output.stdout).toBe('✓ タスク #1 を削除しました\n');
      expect(repository.store.tasks).toEqual([]);
    });

    it('確認で拒否した場合、キャンセルし 0 を返す', async () => {
      const { execute, output, repository } = setup({
        tasks: [buildTask({ id: 1 })],
        answer: false,
      });

      expect(await execute('delete', '1')).toBe(0);
      expect(output.stdout).toBe('削除をキャンセルしました\n');
      expect(repository.store.tasks).toHaveLength(1);
    });

    it('確認できない場合、--force を案内して削除せず 1 を返す', async () => {
      const { execute, output, repository } = setup({
        tasks: [buildTask({ id: 1 })],
      });

      expect(await execute('delete', '1')).toBe(1);

      expect(output.stderr).toContain('--force を指定してください');
      expect(repository.store.tasks).toHaveLength(1);
    });

    it('--force の場合、確認せずに削除する', async () => {
      const { execute, repository, prompts } = setup({
        tasks: [buildTask({ id: 1 })],
      });

      await execute('rm', '1', '--force');

      expect(prompts).toEqual([]);
      expect(repository.store.tasks).toEqual([]);
    });

    it('存在しないIDの場合、確認せずにエラーにする', async () => {
      const { execute, prompts } = setup();

      expect(await execute('delete', '9')).toBe(1);
      expect(prompts).toEqual([]);
    });
  });

  describe('hook', () => {
    it('install / uninstall の結果を表示する', async () => {
      const { execute, output } = setup();

      await execute('hook', 'install');
      await execute('hook', 'install');
      await execute('hook', 'uninstall');
      await execute('hook', 'uninstall');

      expect(output.stdout).toBe(
        [
          '✓ prepare-commit-msg フックをインストールしました',
          'prepare-commit-msg フックは既にインストールされています',
          '✓ フックを削除しました',
          'フックはインストールされていません',
          '',
        ].join('\n')
      );
    });

    it('TaskCLI 以外のフックは削除せず警告する', async () => {
      const { execute, output } = setup({
        files: { '/repo/.git/hooks/prepare-commit-msg': '#!/bin/sh\n' },
      });

      expect(await execute('hook', 'uninstall')).toBe(0);
      expect(output.stderr).toContain('削除しませんでした');
    });

    it('既存フックと競合する場合、追記すべき行を案内し 1 を返す', async () => {
      const { execute, output } = setup({
        files: { '/repo/.git/hooks/prepare-commit-msg': '#!/bin/sh\n' },
      });

      expect(await execute('hook', 'install')).toBe(1);
      expect(output.stderr).toContain('task hook run "$1" "$2" || true');
    });

    it('run でコミットメッセージにトレーラーを追記する', async () => {
      const { execute, files } = setup({
        tasks: [buildTask({ id: 1, branch: 'feature/task-1' })],
        git: { currentBranch: 'feature/task-1' },
        files: { '/msg': 'Subject\n' },
      });

      expect(await execute('hook', 'run', '/msg', '')).toBe(0);
      expect(files.files.get('/msg')).toBe('Subject\n\nTask: #1\n');
    });

    it('run でエラーが起きても警告のみ表示し 0 を返す', async () => {
      const { execute, output } = setup({ isGitRepository: true });
      const failing = run(['hook', 'run', '/msg'], {
        output,
        prompt: { confirm: async () => undefined },
        createContext: async () => {
          throw new Error('broken');
        },
        version: '0.0.0',
        debug: false,
      });

      expect(await failing).toBe(0);
      expect(output.stderr).toContain(
        '⚠ TaskCLI: コミットメッセージにタスク番号を追記できませんでした(broken)'
      );
      expect(await execute('hook', 'run', '/missing')).toBe(0);
    });
  });
});

describe('translateCommanderError', () => {
  const formatter = new MessageFormatter(false);

  it.each([
    [
      "error: unknown option '--foo'\n(Did you mean --force?)",
      '✗ 不明なオプションです: --foo\n  もしかして: --force\n',
    ],
    [
      "error: option '-b, --branch <name>' argument missing",
      '✗ オプションの値が指定されていません: -b, --branch <name>',
    ],
    [
      "error: too many arguments for 'show'. Expected 1 argument but got 2.",
      '✗ 引数が多すぎます',
    ],
    [
      "error: missing required argument 'id'",
      '✗ 必須の引数が指定されていません: id',
    ],
    ['error: something else', '✗ something else'],
  ])('%s を日本語に変換する', (input, expected) => {
    expect(translateCommanderError(input, formatter)).toContain(expected);
  });
});
