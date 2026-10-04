import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FileSystemError } from '../domain/errors.js';
import type { TextFilePort } from '../services/ports.js';

const EXECUTABLE_MODE = 0o755;

/**
 * フックスクリプト・コミットメッセージ・.task/ 内の補助ファイルを読み書きする。
 */
export class TextFileSystem implements TextFilePort {
  async read(path: string): Promise<string | undefined> {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') {
        return undefined;
      }
      throw new FileSystemError(path, getErrorCode(error));
    }
  }

  async write(
    path: string,
    content: string,
    options: { executable?: boolean } = {}
  ): Promise<void> {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf8');
      if (options.executable === true) {
        // Windows では効果がないが、Git for Windows は権限に関係なくフックを実行する
        await chmod(path, EXECUTABLE_MODE);
      }
    } catch (error) {
      throw new FileSystemError(path, getErrorCode(error));
    }
  }

  async remove(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        throw new FileSystemError(path, getErrorCode(error));
      }
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
