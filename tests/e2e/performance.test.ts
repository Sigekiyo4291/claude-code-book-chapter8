import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../helpers/runCli.js';
import { createTempGitRepo, removeTempDir } from '../helpers/tempDir.js';
import { buildTask } from '../helpers/taskFactory.js';

const TASK_COUNT = 1000;
// PRD: 1,000件の task list が1秒以内。CI の環境差を考慮し、Node.js 起動を含めて目標の2倍を上限とする
const LIST_LIMIT_MS = 2000;

describe('性能(E2E)', () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await createTempGitRepo();
    const tasks = Array.from({ length: TASK_COUNT }, (_, index) =>
      buildTask({
        id: index + 1,
        title: `パフォーマンス計測用のタスク ${index + 1}`,
        status: index % 4 === 0 ? 'completed' : 'open',
      })
    );
    await mkdir(join(repoDir, '.task'));
    await writeFile(
      join(repoDir, '.task', 'tasks.json'),
      JSON.stringify(
        { schemaVersion: 1, nextId: TASK_COUNT + 1, tasks },
        null,
        2
      )
    );
  });

  afterEach(async () => {
    await removeTempDir(repoDir);
  });

  it(`タスク${TASK_COUNT}件の task list が ${LIST_LIMIT_MS}ms 以内に完了する`, async () => {
    const durations: number[] = [];
    for (let i = 0; i < 3; i++) {
      const startedAt = performance.now();
      const result = await runCli(['list'], { cwd: repoDir });
      durations.push(performance.now() - startedAt);
      expect(result.stdout.trimEnd().split('\n')).toHaveLength(TASK_COUNT + 1);
    }

    const median = [...durations].sort((a, b) => a - b)[1] ?? Infinity;
    expect(median).toBeLessThan(LIST_LIMIT_MS);
  });
});
