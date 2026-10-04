import { createInterface } from 'node:readline';

/**
 * y/N 形式の確認を行う。
 */
export interface ConfirmPrompt {
  /**
   * @returns 同意なら true、拒否なら false、入力を得られなかった場合(標準入力の終端)は undefined
   */
  confirm(message: string): Promise<boolean | undefined>;
}

export function isAffirmative(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

/**
 * 標準入力から1行読み取る確認プロンプト。
 * パイプからの入力(`echo y | task delete 1`)にも対応する。
 */
export function createStdinPrompt(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout
): ConfirmPrompt {
  return {
    confirm: (message) =>
      new Promise((resolve) => {
        const rl = createInterface({ input, terminal: false });
        let answered = false;
        output.write(`${message} [y/N] `);
        rl.once('line', (line) => {
          answered = true;
          // パイプ入力では回答が画面に表示されないため、改行して以降の出力と分ける
          if (!isTTY(input)) {
            output.write('\n');
          }
          rl.close();
          resolve(isAffirmative(line));
        });
        rl.once('close', () => {
          if (!answered) {
            output.write('\n');
            resolve(undefined);
          }
        });
      }),
  };
}

function isTTY(stream: NodeJS.ReadableStream): boolean {
  return 'isTTY' in stream && stream.isTTY === true;
}
