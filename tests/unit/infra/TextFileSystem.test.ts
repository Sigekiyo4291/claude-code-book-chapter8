import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileSystemError } from '../../../src/domain/errors.js';
import { TextFileSystem } from '../../../src/infra/TextFileSystem.js';
import { createTempDir, removeTempDir } from '../../helpers/tempDir.js';

describe('TextFileSystem', () => {
  let dir: string;
  const files = new TextFileSystem();

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it('書き込んだ内容を読み込め、存在しないファイルは undefined を返す', async () => {
    const path = join(dir, 'nested', 'file.txt');

    expect(await files.read(path)).toBeUndefined();
    await files.write(path, 'hello');
    expect(await files.read(path)).toBe('hello');
  });

  it.skipIf(process.platform === 'win32')(
    'executable を指定した場合、実行権限を付与する',
    async () => {
      const path = join(dir, 'hook');

      await files.write(path, '#!/bin/sh\n', { executable: true });

      expect((await stat(path)).mode & 0o111).not.toBe(0);
    }
  );

  it('削除後は undefined を返し、存在しないファイルの削除はエラーにしない', async () => {
    const path = join(dir, 'file.txt');
    await files.write(path, 'x');

    await files.remove(path);
    await files.remove(path);

    expect(await files.read(path)).toBeUndefined();
  });

  it('ディレクトリを読もうとした場合、FileSystemError を送出する', async () => {
    await mkdir(join(dir, 'sub'));

    await expect(files.read(join(dir, 'sub'))).rejects.toThrow(FileSystemError);
    await expect(files.remove(join(dir, 'sub'))).rejects.toThrow(
      FileSystemError
    );
    await expect(files.write(join(dir, 'sub'), 'x')).rejects.toThrow(
      FileSystemError
    );
  });
});
