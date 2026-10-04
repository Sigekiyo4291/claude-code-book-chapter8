import { describe, expect, it } from 'vitest';
import type { TaskStatus } from '../../../src/domain/Task.js';
import { InvalidStatusTransitionError } from '../../../src/domain/errors.js';
import {
  StatusTransitionPolicy,
  type TaskAction,
} from '../../../src/services/StatusTransitionPolicy.js';

describe('StatusTransitionPolicy', () => {
  const policy = new StatusTransitionPolicy();

  describe('next', () => {
    const allowed: [TaskStatus, TaskAction, TaskStatus][] = [
      ['open', 'start', 'in_progress'],
      ['completed', 'start', 'in_progress'],
      ['open', 'complete', 'completed'],
      ['in_progress', 'complete', 'completed'],
      ['open', 'archive', 'archived'],
      ['in_progress', 'archive', 'archived'],
      ['completed', 'archive', 'archived'],
    ];

    it.each(allowed)(
      '%s のタスクに %s を行った場合、%s に遷移する',
      (current, action, expected) => {
        expect(policy.next(1, current, action)).toBe(expected);
      }
    );

    const rejected: [TaskStatus, TaskAction, string | undefined][] = [
      ['in_progress', 'start', 'task done 1'],
      ['archived', 'start', 'task add'],
      ['completed', 'complete', 'task start 1'],
      ['archived', 'complete', 'task add'],
      ['archived', 'archive', 'task add'],
    ];

    it.each(rejected)(
      '%s のタスクに %s を行った場合、ヒント付きの InvalidStatusTransitionError を送出する',
      (current, action, hintKeyword) => {
        let caught: unknown;
        try {
          policy.next(1, current, action);
        } catch (error) {
          caught = error;
        }
        if (!(caught instanceof InvalidStatusTransitionError)) {
          throw new Error(
            'InvalidStatusTransitionError が送出されませんでした'
          );
        }
        const error = caught;
        expect(error.message).toContain('タスク #1');
        expect(error.message).toContain(current);
        expect(error.hint).toContain(hintKeyword);
      }
    );
  });
});
