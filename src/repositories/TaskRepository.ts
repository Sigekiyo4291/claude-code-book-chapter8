import { join } from 'node:path';
import { createEmptyStore, type TaskStore } from '../domain/Task.js';
import { CorruptedDataError } from '../domain/errors.js';
import type { JsonFileStorage } from '../infra/JsonFileStorage.js';
import type { TaskRepositoryPort, TextFilePort } from '../services/ports.js';
import { migrateToCurrent } from './migrations.js';
import { findTaskStoreProblem, isTaskStore } from './taskStoreSchema.js';

const SUPPORT_FILES: readonly (readonly [string, string])[] = [
  ['.gitignore', 'tasks.json.bak\n*.tmp\n'],
  ['.gitattributes', 'tasks.json text eol=lf\n'],
];

/**
 * tasks.json の読み込み・保存と、.task/ ディレクトリの初期化を行う。
 */
export class TaskRepository implements TaskRepositoryPort {
  constructor(
    private readonly storage: JsonFileStorage,
    private readonly files: TextFilePort,
    private readonly dataDir: string
  ) {}

  /**
   * @throws {CorruptedDataError} tasks.json の形式が不正な場合
   * @throws {UnsupportedSchemaError} tasks.json が新しいバージョンで作成された場合
   */
  async load(): Promise<TaskStore> {
    const raw = await this.storage.read();
    if (raw === undefined) {
      return createEmptyStore();
    }

    const migrated = migrateToCurrent(raw);
    if (!isTaskStore(migrated)) {
      throw new CorruptedDataError(
        this.storage.filePath,
        findTaskStoreProblem(migrated) ?? '形式が不正です'
      );
    }
    return migrated;
  }

  async save(store: TaskStore): Promise<void> {
    await this.ensureSupportFiles();
    const sortedTasks = [...store.tasks].sort((a, b) => a.id - b.id);
    await this.storage.write({ ...store, tasks: sortedTasks });
  }

  async initialize(): Promise<'created' | 'already_exists'> {
    if ((await this.storage.read()) !== undefined) {
      await this.ensureSupportFiles();
      return 'already_exists';
    }
    await this.save(createEmptyStore());
    return 'created';
  }

  /**
   * バックアップ・一時ファイルを Git 管理から外し、改行コードを LF に固定する。
   * 自動初期化(task init を経ずに task add した場合)でも作成されるよう、保存のたびに確認する。
   */
  private async ensureSupportFiles(): Promise<void> {
    for (const [name, content] of SUPPORT_FILES) {
      const path = join(this.dataDir, name);
      if ((await this.files.read(path)) === undefined) {
        await this.files.write(path, content);
      }
    }
  }
}
