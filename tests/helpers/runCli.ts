import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { delimiter, join, resolve } from 'node:path';

export const CLI_PATH = resolve(import.meta.dirname, '../../dist/cli/index.js');

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunCliOptions {
  cwd: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * ビルド済みの CLI を子プロセスとして実行する。
 */
export function runCli(
  args: string[],
  options: RunCliOptions
): Promise<CliResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: undefined, ...options.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
    child.stdin.end(options.input);
  });
}

/**
 * `task` コマンドを PATH 上に用意する(フックから呼ばれる CLI として使う)。
 *
 * @returns PATH の先頭に追加すべきディレクトリ
 */
export async function createTaskShim(dir: string): Promise<string> {
  const binDir = join(dir, 'bin');
  await mkdir(binDir, { recursive: true });
  const shimPath = join(binDir, 'task');
  await writeFile(
    shimPath,
    `#!/bin/sh\nexec "${process.execPath}" "${CLI_PATH}" "$@"\n`,
    { mode: 0o755 }
  );
  return binDir;
}

export function prependPath(dir: string): string {
  return `${dir}${delimiter}${process.env.PATH ?? ''}`;
}
