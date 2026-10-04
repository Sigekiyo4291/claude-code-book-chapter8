import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CorruptedDataError,
  UnsupportedSchemaError,
} from '../../../src/domain/errors.js';
import { JsonFileStorage } from '../../../src/infra/JsonFileStorage.js';
import { TextFileSystem } from '../../../src/infra/TextFileSystem.js';
import { TaskRepository } from '../../../src/repositories/TaskRepository.js';
import { createTempDir, removeTempDir } from '../../helpers/tempDir.js';
import { buildTask } from '../../helpers/taskFactory.js';

describe('TaskRepository', () => {
  let dir: string;
  let dataDir: string;
  let tasksPath: string;
  let repository: TaskRepository;

  beforeEach(async () => {
    dir = await createTempDir();
    dataDir = join(dir, '.task');
    tasksPath = join(dataDir, 'tasks.json');
    repository = new TaskRepository(
      new JsonFileStorage(tasksPath),
      new TextFileSystem(),
      dataDir
    );
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  describe('load', () => {
    it('ファイルがない場合、空のストアを返す', async () => {
      expect(await repository.load()).toEqual({
        schemaVersion: 1,
        nextId: 1,
        tasks: [],
      });
    });

    it('形式が不正な場合、CorruptedDataError を送出する', async () => {
      await repository.initialize();
      await writeFile(
        tasksPath,
        JSON.stringify({ schemaVersion: 1, tasks: [] })
      );

      await expect(repository.load()).rejects.toThrow(CorruptedDataError);
      await expect(repository.load()).rejects.toThrow('nextId');
    });

    it('新しい schemaVersion の場合、UnsupportedSchemaError を送出する', async () => {
      await repository.initialize();
      await writeFile(tasksPath, JSON.stringify({ schemaVersion: 99 }));

      await expect(repository.load()).rejects.toThrow(UnsupportedSchemaError);
    });

    it('CRLF で保存されたファイルも読み込める', async () => {
      await repository.initialize();
      await writeFile(
        tasksPath,
        '{\r\n  "schemaVersion": 1,\r\n  "nextId": 1,\r\n  "tasks": []\r\n}\r\n'
      );

      expect((await repository.load()).nextId).toBe(1);
    });
  });

  describe('save', () => {
    it('ID 昇順で保存し、.gitignore と .gitattributes を作成する', async () => {
      await repository.save({
        schemaVersion: 1,
        nextId: 3,
        tasks: [buildTask({ id: 2 }), buildTask({ id: 1 })],
      });

      const loaded = await repository.load();
      expect(loaded.tasks.map((task) => task.id)).toEqual([1, 2]);
      expect(await readFile(join(dataDir, '.gitignore'), 'utf8')).toContain(
        'tasks.json.bak'
      );
      expect(await readFile(join(dataDir, '.gitattributes'), 'utf8')).toContain(
        'eol=lf'
      );
    });

    it('.gitattributes だけが欠けている場合、作成する', async () => {
      await repository.initialize();
      const { rm } = await import('node:fs/promises');
      await rm(join(dataDir, '.gitattributes'));

      await repository.save({ schemaVersion: 1, nextId: 1, tasks: [] });

      expect(await readFile(join(dataDir, '.gitattributes'), 'utf8')).toContain(
        'eol=lf'
      );
    });

    it('既存の .gitignore は上書きしない', async () => {
      await repository.initialize();
      await writeFile(join(dataDir, '.gitignore'), 'custom\n');

      await repository.save({ schemaVersion: 1, nextId: 1, tasks: [] });

      expect(await readFile(join(dataDir, '.gitignore'), 'utf8')).toBe(
        'custom\n'
      );
    });
  });

  describe('initialize', () => {
    it('初回は created、2回目は already_exists を返す', async () => {
      expect(await repository.initialize()).toBe('created');
      expect(await repository.initialize()).toBe('already_exists');
      expect(JSON.parse(await readFile(tasksPath, 'utf8'))).toEqual({
        schemaVersion: 1,
        nextId: 1,
        tasks: [],
      });
    });
  });
});
