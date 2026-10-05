import type { Task } from '../../src/domain/Task.js';

export function buildTask(overrides: Partial<Task> & { id: number }): Task {
  return {
    title: `タスク${overrides.id}`,
    status: 'open',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}
