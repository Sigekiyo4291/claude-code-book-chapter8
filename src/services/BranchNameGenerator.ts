import { BRANCH_PREFIX, MAX_SLUG_LENGTH } from '../domain/Task.js';
import { InvalidBranchNameError } from '../domain/errors.js';
import type { GitPort } from './ports.js';

/**
 * タスクのブランチ名を生成・検証する。
 */
export class BranchNameGenerator {
  constructor(private readonly git: Pick<GitPort, 'isValidBranchName'>) {}

  /**
   * タイトルから `feature/task-<id>-<slug>` 形式のブランチ名を生成する。
   * 英数字のスラッグを作れない場合は `feature/task-<id>` とする。
   */
  generate(id: number, title: string): string {
    const slug = toSlug(title);
    return slug === ''
      ? `${BRANCH_PREFIX}${id}`
      : `${BRANCH_PREFIX}${id}-${slug}`;
  }

  /**
   * @throws {InvalidBranchNameError} Gitで使用できない名前の場合
   */
  async validate(name: string): Promise<void> {
    // 先頭が "-" の名前は git のオプションと誤認されるため、git に渡す前に拒否する
    if (name === '' || name.startsWith('-')) {
      throw new InvalidBranchNameError(name);
    }
    if (!(await this.git.isValidBranchName(name))) {
      throw new InvalidBranchNameError(name);
    }
  }
}

export function toSlug(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}
