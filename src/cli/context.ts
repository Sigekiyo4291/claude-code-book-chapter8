import { join } from 'node:path';
import { TASKS_FILE_NAME, type Workspace } from '../domain/Task.js';
import { GitClient } from '../infra/GitClient.js';
import { JsonFileStorage } from '../infra/JsonFileStorage.js';
import { TextFileSystem } from '../infra/TextFileSystem.js';
import { WorkspaceResolver } from '../infra/WorkspaceResolver.js';
import { TaskRepository } from '../repositories/TaskRepository.js';
import { BranchNameGenerator } from '../services/BranchNameGenerator.js';
import { systemClock } from '../services/Clock.js';
import { CommitHookService } from '../services/CommitHookService.js';
import type { GitPort } from '../services/ports.js';
import { StatusTransitionPolicy } from '../services/StatusTransitionPolicy.js';
import { TaskService } from '../services/TaskService.js';

/**
 * コマンドの実行に必要な、作業ディレクトリに依存するオブジェクト群。
 */
export interface CommandContext {
  workspace: Workspace;
  taskService: TaskService;
  hookService: CommitHookService;
  git: GitPort;
}

export type ContextFactory = () => Promise<CommandContext>;

/**
 * コンポジションルート。依存の組み立てはこの関数でのみ行う。
 */
export async function createContext(cwd: string): Promise<CommandContext> {
  const workspace = await new WorkspaceResolver().resolve(cwd);
  const files = new TextFileSystem();
  const repository = new TaskRepository(
    new JsonFileStorage(join(workspace.dataDir, TASKS_FILE_NAME)),
    files,
    workspace.dataDir
  );
  const git = new GitClient(workspace.rootDir);
  const taskService = new TaskService({
    repository,
    git,
    workspace,
    policy: new StatusTransitionPolicy(),
    branchNameGenerator: new BranchNameGenerator(git),
    clock: systemClock,
  });
  const hookService = new CommitHookService({
    git,
    files,
    taskService,
    isGitRepository: workspace.isGitRepository,
  });
  return { workspace, taskService, hookService, git };
}
