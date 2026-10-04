import stringWidth from 'string-width';
import { describe, expect, it } from 'vitest';
import {
  createTablePresenter,
  formatDateTime,
  TablePresenter,
} from '../../../../src/cli/presenters/TablePresenter.js';
import { buildTask } from '../../../helpers/taskFactory.js';

describe('TablePresenter', () => {
  const presenter = new TablePresenter(false, stringWidth);

  describe('renderTaskList', () => {
    it('全角文字を含むタイトルでも列を揃える', () => {
      const output = presenter.renderTaskList([
        buildTask({
          id: 1,
          title: 'ユーザー認証機能の実装',
          status: 'in_progress',
          branch: 'feature/task-1',
        }),
        buildTask({ id: 2, title: 'データエクスポート機能' }),
        buildTask({
          id: 10,
          title: 'Initial setup',
          status: 'completed',
          branch: 'feature/task-10-initial-setup',
        }),
      ]);

      expect(output).toBe(
        [
          '  ID  Status       Title                   Branch',
          '  1   in_progress  ユーザー認証機能の実装  feature/task-1',
          '  2   open         データエクスポート機能  -',
          '  10  completed    Initial setup           feature/task-10-initial-setup',
          '',
        ].join('\n')
      );
    });

    it('現在のブランチに紐付くタスクの行頭に * を付ける', () => {
      const output = presenter.renderTaskList(
        [
          buildTask({ id: 1, branch: 'feature/task-1' }),
          buildTask({ id: 2, branch: 'feature/task-2' }),
        ],
        { currentBranch: 'feature/task-2' }
      );

      const lines = output.split('\n');
      expect(lines[1]?.startsWith('  1')).toBe(true);
      expect(lines[2]?.startsWith('* 2')).toBe(true);
    });

    it('アーカイブ済みのタスクには * を付けない', () => {
      const output = presenter.renderTaskList(
        [buildTask({ id: 1, branch: 'b', status: 'archived' })],
        { currentBranch: 'b' }
      );

      expect(output).not.toContain('* 1');
    });

    it('表示幅50を超えるタイトルは … で切り詰める', () => {
      const output = presenter.renderTaskList([
        buildTask({ id: 1, title: 'あ'.repeat(30) }),
      ]);

      const titleCell = output
        .split('\n')[1]
        ?.split('  ')
        .find((cell) => cell.includes('あ'));
      expect(titleCell).toBe(`${'あ'.repeat(24)}…`);
      expect(stringWidth(titleCell ?? '')).toBeLessThanOrEqual(50);
    });

    it('タイトル中の制御文字を除去する', () => {
      const output = presenter.renderTaskList([
        buildTask({ id: 1, title: 'evil\u001b[2Jtitle' }),
      ]);

      expect(output).not.toContain('\u001b');
    });

    it('色ありの場合、ステータスに色を付けても列を揃える', async () => {
      const colored = await createTablePresenter(true);

      const tasks = [
        buildTask({ id: 1, status: 'in_progress' }),
        buildTask({ id: 2, status: 'completed' }),
        buildTask({ id: 3, status: 'archived' }),
        buildTask({ id: 4, status: 'open' }),
      ];

      const output = colored.renderTaskList(tasks);

      expect(output).toContain('\u001b[33min_progress');
      // eslint-disable-next-line no-control-regex -- ANSI エスケープの除去
      expect(output.replace(/\u001b\[\d+m/g, '')).toBe(
        presenter.renderTaskList(tasks)
      );
    });
  });

  describe('renderTaskDetail', () => {
    it('全項目と説明を表示する', () => {
      const output = presenter.renderTaskDetail(
        buildTask({
          id: 1,
          title: 'ログイン画面',
          description: '一行目\n二行目',
          status: 'completed',
          branch: 'feature/task-1',
          createdAt: '2026-10-03T01:00:00.000Z',
          updatedAt: '2026-10-03T02:30:00.000Z',
          completedAt: '2026-10-03T02:30:00.000Z',
        })
      );

      expect(output).toBe(
        [
          'タスク #1',
          '  タイトル    : ログイン画面',
          '  ステータス  : completed',
          '  ブランチ    : feature/task-1',
          '  作成日時    : 2026-10-03 01:00',
          '  更新日時    : 2026-10-03 02:30',
          '  完了日時    : 2026-10-03 02:30',
          '',
          '  説明:',
          '    一行目',
          '    二行目',
          '',
        ].join('\n')
      );
    });

    it('ブランチ・完了日時・説明がない場合は - を表示し説明欄を省く', () => {
      const output = presenter.renderTaskDetail(buildTask({ id: 2 }));

      expect(output).toContain('  ブランチ    : -');
      expect(output).toContain('  完了日時    : -');
      expect(output).not.toContain('説明:');
    });
  });

  describe('formatDateTime', () => {
    it('不正な日時はそのまま返す', () => {
      expect(formatDateTime('invalid')).toBe('invalid');
    });
  });
});
