import { randomBytes } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { CorruptedDataError, FileSystemError } from '../domain/errors.js';

const RENAME_RETRY_COUNT = 3;
const RENAME_RETRY_DELAY_MS = 50;

/**
 * JSON ファイルを安全に読み書きする。
 * 書き込みは一時ファイル + rename によるアトミック書き込みで、直前の状態を .bak に残す。
 */
export class JsonFileStorage {
  constructor(readonly filePath: string) {}

  get backupPath(): string {
    return `${this.filePath}.bak`;
  }

  /**
   * @returns 解析した値。ファイルが存在しない場合は undefined
   * @throws {CorruptedDataError} JSON として解析できない場合
   * @throws {FileSystemError} 読み込みに失敗した場合
   */
  async read(): Promise<unknown> {
    let content: string;
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') {
        return undefined;
      }
      throw new FileSystemError(this.filePath, getErrorCode(error));
    }

    try {
      const parsed: unknown = JSON.parse(content);
      return parsed;
    } catch (error) {
      throw new CorruptedDataError(
        this.filePath,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * @throws {FileSystemError} 書き込みに失敗した場合(一時ファイルは削除される)
   */
  async write(data: unknown): Promise<void> {
    const tempPath = `${this.filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await this.backup();
      await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      await renameWithRetry(tempPath, this.filePath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw new FileSystemError(this.filePath, getErrorCode(error));
    }
  }

  private async backup(): Promise<void> {
    try {
      await copyFile(this.filePath, this.backupPath);
    } catch (error) {
      // 初回書き込み時はバックアップ対象が存在しない
      if (getErrorCode(error) !== 'ENOENT') {
        throw error;
      }
    }
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      // Windows では rename 先を他プロセスが開いていると EPERM / EBUSY になるため再試行する
      const code = getErrorCode(error);
      const isRetryable = code === 'EPERM' || code === 'EBUSY';
      if (!isRetryable || attempt >= RENAME_RETRY_COUNT) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RENAME_RETRY_DELAY_MS)
      );
    }
  }
}

function getErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'UNKNOWN';
}
