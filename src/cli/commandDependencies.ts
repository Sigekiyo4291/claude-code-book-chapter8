import type { ContextFactory } from './context.js';
import type { ConfirmPrompt } from './io/ConfirmPrompt.js';
import type { Output } from './io/Output.js';
import { MessageFormatter } from './presenters/MessageFormatter.js';

/**
 * 各コマンドが受け取る依存。作業ディレクトリに依存するものは createContext で遅延生成する
 * (`task --help` などで Git を呼び出さないため)。
 */
export interface CommandDependencies {
  output: Output;
  prompt: ConfirmPrompt;
  createContext: ContextFactory;
}

export function createFormatter(output: Output): MessageFormatter {
  return new MessageFormatter(output.color);
}
