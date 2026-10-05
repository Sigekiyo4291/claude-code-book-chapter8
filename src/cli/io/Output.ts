/**
 * 標準出力・標準エラー出力への書き込みと、色付けの可否をまとめる。
 * テストでは createBufferedOutput に差し替える。
 */
export interface Output {
  readonly color: boolean;
  /** 標準出力に書き込む(改行は付与しない) */
  writeOut(text: string): void;
  /** 標準エラー出力に書き込む(改行は付与しない) */
  writeErr(text: string): void;
}

export interface BufferedOutput extends Output {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * 出力先が TTY で、環境変数 NO_COLOR が設定されていない場合のみ色を付ける。
 */
export function shouldUseColor(
  isTTY: boolean | undefined,
  env: NodeJS.ProcessEnv
): boolean {
  return isTTY === true && env.NO_COLOR === undefined;
}

export function createProcessOutput(): Output {
  return {
    color: shouldUseColor(process.stdout.isTTY, process.env),
    writeOut: (text) => {
      process.stdout.write(text);
    },
    writeErr: (text) => {
      process.stderr.write(text);
    },
  };
}

export function createBufferedOutput(color = false): BufferedOutput {
  let stdout = '';
  let stderr = '';
  return {
    color,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    writeOut: (text) => {
      stdout += text;
    },
    writeErr: (text) => {
      stderr += text;
    },
  };
}
