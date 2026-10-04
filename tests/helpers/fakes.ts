import {
  createEmptyStore,
  type Task,
  type TaskStore,
} from '../../src/domain/Task.js';
import { GitOperationError } from '../../src/domain/errors.js';
import type { Clock } from '../../src/services/Clock.js';
import type {
  GitPort,
  TaskRepositoryPort,
  TextFilePort,
} from '../../src/services/ports.js';

export class InMemoryTaskRepository implements TaskRepositoryPort {
  store: TaskStore;
  saveCount = 0;
  initialized = false;

  constructor(tasks: Task[] = [], nextId?: number) {
    this.store = {
      ...createEmptyStore(),
      tasks,
      nextId: nextId ?? Math.max(0, ...tasks.map((task) => task.id)) + 1,
    };
  }

  async load(): Promise<TaskStore> {
    return this.store;
  }

  async save(store: TaskStore): Promise<void> {
    this.saveCount++;
    this.store = store;
  }

  async initialize(): Promise<'created' | 'already_exists'> {
    if (this.initialized) {
      return 'already_exists';
    }
    this.initialized = true;
    return 'created';
  }
}

export interface FakeGitOptions {
  currentBranch?: string;
  branches?: string[];
  failCheckout?: boolean;
  hooksDir?: string;
}

export class FakeGit implements GitPort {
  currentBranch: string | undefined;
  readonly branches: Set<string>;
  readonly calls: string[] = [];

  constructor(private readonly options: FakeGitOptions = {}) {
    this.currentBranch = options.currentBranch;
    this.branches = new Set(options.branches ?? ['main']);
  }

  async getCurrentBranch(): Promise<string | undefined> {
    return this.currentBranch;
  }

  async branchExists(name: string): Promise<boolean> {
    return this.branches.has(name);
  }

  async createAndCheckoutBranch(name: string): Promise<void> {
    this.calls.push(`checkout -b ${name}`);
    this.failIfConfigured(name);
    this.branches.add(name);
    this.currentBranch = name;
  }

  async checkoutBranch(name: string): Promise<void> {
    this.calls.push(`checkout ${name}`);
    this.failIfConfigured(name);
    this.currentBranch = name;
  }

  async isValidBranchName(name: string): Promise<boolean> {
    return !name.includes('..') && !name.includes(' ') && !name.endsWith('/');
  }

  async getHooksDir(): Promise<string> {
    return this.options.hooksDir ?? '/repo/.git/hooks';
  }

  private failIfConfigured(name: string): void {
    if (this.options.failCheckout === true) {
      throw new GitOperationError(
        `ブランチ ${name} に切り替えられませんでした`,
        'error: Your local changes would be overwritten by checkout.'
      );
    }
  }
}

export class InMemoryTextFiles implements TextFilePort {
  readonly files = new Map<string, string>();
  readonly executables = new Set<string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(path, content);
    }
  }

  async read(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async write(
    path: string,
    content: string,
    options: { executable?: boolean } = {}
  ): Promise<void> {
    this.files.set(path, content);
    if (options.executable === true) {
      this.executables.add(path);
    }
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}

export class FixedClock implements Clock {
  constructor(public current = '2026-10-03T01:00:00.000Z') {}

  now(): string {
    return this.current;
  }
}
