import { join, resolve } from 'node:path';
import { DATA_DIR_NAME, type Workspace } from '../domain/Task.js';
import { GitClient } from './GitClient.js';

/**
 * 実行ディレクトリから .task/ の配置場所を決定する。
 * Gitリポジトリ内ではリポジトリのルート、外(または Git 未インストール)ではカレントディレクトリを使う。
 */
export class WorkspaceResolver {
  async resolve(cwd: string): Promise<Workspace> {
    const repositoryRoot = await new GitClient(cwd).getRepositoryRoot();
    const rootDir = resolve(repositoryRoot ?? cwd);
    return {
      rootDir,
      dataDir: join(rootDir, DATA_DIR_NAME),
      isGitRepository: repositoryRoot !== undefined,
    };
  }
}
