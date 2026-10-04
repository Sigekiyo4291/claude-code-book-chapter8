import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../helpers/runCli.js';
import { createTempDir, removeTempDir } from '../helpers/tempDir.js';

describe('出力形式(E2E)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
    await runCli(['add', 'タスク'], { cwd: dir });
    await runCli(['start', '1'], { cwd: dir });
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it('出力先がパイプの場合、色を付けない', async () => {
    const result = await runCli(['list'], {
      cwd: dir,
      env: { FORCE_COLOR: '1' },
    });

    expect(result.stdout).toContain('in_progress');
    expect(result.stdout).not.toContain('\u001b[');
  });

  it('NO_COLOR が設定されている場合、色を付けない', async () => {
    const result = await runCli(['done', '9'], {
      cwd: dir,
      env: { NO_COLOR: '1' },
    });

    expect(result.stderr).toContain('✗');
    expect(result.stderr).not.toContain('\u001b[');
  });
});
