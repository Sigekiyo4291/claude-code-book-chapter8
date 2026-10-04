import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CorruptedDataError,
  FileSystemError,
} from '../../../src/domain/errors.js';
import { JsonFileStorage } from '../../../src/infra/JsonFileStorage.js';
import { createTempDir, removeTempDir } from '../../helpers/tempDir.js';

const isRoot = process.getuid?.() === 0;
const isWindows = process.platform === 'win32';

describe('JsonFileStorage', () => {
  let dir: string;
  let filePath: string;
  let storage: JsonFileStorage;

  beforeEach(async () => {
    dir = await createTempDir();
    filePath = join(dir, 'data', 'tasks.json');
    storage = new JsonFileStorage(filePath);
  });

  afterEach(async () => {
    await chmod(dir, 0o755).catch(() => undefined);
    await removeTempDir(dir);
  });

  describe('read', () => {
    it('ファイルがない場合、undefined を返す', async () => {
      expect(await storage.read()).toBeUndefined();
    });

    it('JSON として解析できない場合、CorruptedDataError を送出する', async () => {
      await mkdir(join(dir, 'data'));
      await writeFile(filePath, '{ broken');

      await expect(storage.read()).rejects.toThrow(CorruptedDataError);
      await expect(storage.read()).rejects.toMatchObject({
        hint: expect.stringContaining(`${filePath}.bak`),
      });
    });

    it('ファイル以外を読もうとした場合、FileSystemError を送出する', async () => {
      await mkdir(filePath, { recursive: true });

      await expect(storage.read()).rejects.toThrow(FileSystemError);
    });
  });

  describe('write', () => {
    it('ディレクトリを作成し、インデント付きの JSON と末尾改行で書き込む', async () => {
      await storage.write({ a: 1 });

      expect(await readFile(filePath, 'utf8')).toBe('{\n  "a": 1\n}\n');
      expect(await storage.read()).toEqual({ a: 1 });
    });

    it('書き込み前の内容を .bak に保存する', async () => {
      await storage.write({ version: 1 });
      await storage.write({ version: 2 });

      expect(JSON.parse(await readFile(storage.backupPath, 'utf8'))).toEqual({
        version: 1,
      });
      expect(await storage.read()).toEqual({ version: 2 });
    });

    it('一時ファイルを残さない', async () => {
      await storage.write({ a: 1 });

      const files = await readdir(join(dir, 'data'));
      expect(files.filter((name) => name.endsWith('.tmp'))).toEqual([]);
    });

    it.skipIf(isRoot || isWindows)(
      '書き込めない場合、FileSystemError を送出し既存の内容を保つ',
      async () => {
        await storage.write({ version: 1 });
        await chmod(join(dir, 'data'), 0o555);

        await expect(storage.write({ version: 2 })).rejects.toThrow(
          FileSystemError
        );
        await chmod(join(dir, 'data'), 0o755);
        expect(await storage.read()).toEqual({ version: 1 });
      }
    );
  });
});
