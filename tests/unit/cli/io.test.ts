import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  createStdinPrompt,
  isAffirmative,
} from '../../../src/cli/io/ConfirmPrompt.js';
import { shouldUseColor } from '../../../src/cli/io/Output.js';

describe('shouldUseColor', () => {
  it('TTY かつ NO_COLOR 未設定の場合のみ true を返す', () => {
    expect(shouldUseColor(true, {})).toBe(true);
    expect(shouldUseColor(false, {})).toBe(false);
    expect(shouldUseColor(undefined, {})).toBe(false);
    expect(shouldUseColor(true, { NO_COLOR: '' })).toBe(false);
  });
});

describe('isAffirmative', () => {
  it.each([
    ['y', true],
    ['Y', true],
    [' yes ', true],
    ['YES', true],
    ['n', false],
    ['', false],
    ['yeah', false],
  ])('"%s" は %s', (answer, expected) => {
    expect(isAffirmative(answer)).toBe(expected);
  });
});

describe('createStdinPrompt', () => {
  function setup() {
    const input = new PassThrough();
    const output = new PassThrough();
    let written = '';
    output.on('data', (chunk: Buffer) => {
      written += chunk.toString();
    });
    return {
      input,
      output,
      prompt: createStdinPrompt(input, output),
      written: () => written,
    };
  }

  it('入力された1行で判定する', async () => {
    const { input, prompt, written } = setup();

    const answer = prompt.confirm('削除しますか?');
    input.write('y\n');

    expect(await answer).toBe(true);
    expect(written()).toBe('削除しますか? [y/N] \n');
  });

  it('入力が終端に達した場合、undefined を返す', async () => {
    const { input, prompt } = setup();

    const answer = prompt.confirm('削除しますか?');
    input.end();

    expect(await answer).toBeUndefined();
  });
});
