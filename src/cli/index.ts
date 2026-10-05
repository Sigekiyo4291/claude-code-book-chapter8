#!/usr/bin/env node
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { createContext } from './context.js';
import { createStdinPrompt } from './io/ConfirmPrompt.js';
import { createProcessOutput } from './io/Output.js';
import { run } from './program.js';

const startedAt = performance.now();
const debug = process.env.TASKCLI_DEBUG === '1';

const output = createProcessOutput();
const exitCode = await run(process.argv.slice(2), {
  output,
  prompt: createStdinPrompt(),
  createContext: () => createContext(process.cwd()),
  version: readVersion(),
  debug,
});

if (debug) {
  console.error(`[taskcli] ${(performance.now() - startedAt).toFixed(1)}ms`);
}
// process.exit() は標準出力のフラッシュ前に終了し得るため、exitCode を設定して自然終了させる
process.exitCode = exitCode;

function readVersion(): string {
  // dist/cli/index.js と src/cli/index.ts のどちらからでも package.json は2階層上にある
  const packageJson: unknown = createRequire(import.meta.url)(
    '../../package.json'
  );
  if (
    typeof packageJson === 'object' &&
    packageJson !== null &&
    'version' in packageJson &&
    typeof packageJson.version === 'string'
  ) {
    return packageJson.version;
  }
  return '0.0.0';
}
