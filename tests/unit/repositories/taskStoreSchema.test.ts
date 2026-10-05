import { describe, expect, it } from 'vitest';
import {
  findTaskStoreProblem,
  isTaskStore,
} from '../../../src/repositories/taskStoreSchema.js';
import { buildTask } from '../../helpers/taskFactory.js';

const validStore = {
  schemaVersion: 1,
  nextId: 3,
  tasks: [
    buildTask({ id: 1 }),
    buildTask({
      id: 2,
      status: 'completed',
      branch: 'feature/task-2',
      description: 'desc',
      completedAt: '2026-10-02T00:00:00.000Z',
    }),
  ],
};

describe('taskStoreSchema', () => {
  describe('isTaskStore', () => {
    it('正しい形式の場合、true を返す', () => {
      expect(isTaskStore(validStore)).toBe(true);
      expect(isTaskStore({ schemaVersion: 1, nextId: 1, tasks: [] })).toBe(
        true
      );
    });
  });

  describe('findTaskStoreProblem', () => {
    it.each([
      ['null', null, 'ルートがオブジェクトではありません'],
      ['配列', [], 'ルートがオブジェクトではありません'],
      ['schemaVersion なし', { nextId: 1, tasks: [] }, 'schemaVersion'],
      [
        'nextId が0',
        { schemaVersion: 1, nextId: 0, tasks: [] },
        'nextId が正の整数',
      ],
      [
        'tasks がオブジェクト',
        { schemaVersion: 1, nextId: 1, tasks: {} },
        'tasks が配列',
      ],
      [
        'タスクが文字列',
        { ...validStore, tasks: ['x'] },
        'tasks[0] の値がオブジェクト',
      ],
      [
        'id が文字列',
        { ...validStore, tasks: [{ ...buildTask({ id: 1 }), id: '1' }] },
        'id が正の整数',
      ],
      [
        'title がない',
        { ...validStore, tasks: [{ ...buildTask({ id: 1 }), title: 1 }] },
        'title',
      ],
      [
        'description が数値',
        { ...validStore, tasks: [{ ...buildTask({ id: 1 }), description: 1 }] },
        'description',
      ],
      [
        'status が不正',
        { ...validStore, tasks: [{ ...buildTask({ id: 1 }), status: 'todo' }] },
        'status',
      ],
      [
        'branch が数値',
        { ...validStore, tasks: [{ ...buildTask({ id: 1 }), branch: 1 }] },
        'branch',
      ],
      [
        'createdAt がない',
        {
          ...validStore,
          tasks: [{ ...buildTask({ id: 1 }), createdAt: undefined }],
        },
        'createdAt',
      ],
      [
        'completedAt が数値',
        { ...validStore, tasks: [{ ...buildTask({ id: 1 }), completedAt: 0 }] },
        'completedAt',
      ],
      [
        'id が重複',
        { ...validStore, tasks: [buildTask({ id: 1 }), buildTask({ id: 1 })] },
        '重複',
      ],
      ['nextId が最大ID以下', { ...validStore, nextId: 2 }, 'nextId(2)'],
    ])('%s の場合、問題を返す', (_, value, expected) => {
      expect(findTaskStoreProblem(value)).toContain(expected);
    });
  });
});
