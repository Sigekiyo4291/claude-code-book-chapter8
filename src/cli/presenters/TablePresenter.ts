import picocolors from 'picocolors';
import type { Task, TaskStatus } from '../../domain/Task.js';
import { sanitizeForTerminal } from './sanitizeForTerminal.js';

export type MeasureWidth = (text: string) => number;

export interface TableOptions {
  currentBranch?: string;
}

const TITLE_MAX_WIDTH = 50;
const ELLIPSIS = '…';
const COLUMN_GAP = '  ';
const CURRENT_MARKER = '* ';
const NO_MARKER = '  ';
const EMPTY_VALUE = '-';

type Colors = ReturnType<typeof picocolors.createColors>;

/**
 * タスク一覧・詳細を端末表示用の文字列に整形する。
 */
export class TablePresenter {
  private readonly colors: Colors;

  constructor(
    color: boolean,
    private readonly measureWidth: MeasureWidth
  ) {
    this.colors = picocolors.createColors(color);
  }

  renderTaskList(tasks: readonly Task[], options: TableOptions = {}): string {
    const header = ['ID', 'Status', 'Title', 'Branch'];
    const rows = tasks.map((task) => [
      String(task.id),
      task.status,
      this.truncate(sanitizeForTerminal(task.title), TITLE_MAX_WIDTH),
      task.branch === undefined
        ? EMPTY_VALUE
        : sanitizeForTerminal(task.branch),
    ]);

    const columnWidths = header.map((cell, column) =>
      Math.max(
        this.measureWidth(cell),
        ...rows.map((row) => this.measureWidth(row[column] ?? ''))
      )
    );

    const lines = [NO_MARKER + this.formatRow(header, columnWidths)];
    tasks.forEach((task, index) => {
      const isCurrent =
        options.currentBranch !== undefined &&
        task.branch === options.currentBranch &&
        task.status !== 'archived';
      const cells = rows[index] ?? [];
      lines.push(
        (isCurrent ? CURRENT_MARKER : NO_MARKER) +
          this.formatRow(cells, columnWidths, task.status)
      );
    });
    return `${lines.join('\n')}\n`;
  }

  renderTaskDetail(task: Task): string {
    const lines = [
      `タスク #${task.id}`,
      `  タイトル    : ${sanitizeForTerminal(task.title)}`,
      `  ステータス  : ${this.colorStatus(task.status, task.status)}`,
      `  ブランチ    : ${task.branch === undefined ? EMPTY_VALUE : sanitizeForTerminal(task.branch)}`,
      `  作成日時    : ${formatDateTime(task.createdAt)}`,
      `  更新日時    : ${formatDateTime(task.updatedAt)}`,
      `  完了日時    : ${task.completedAt === undefined ? EMPTY_VALUE : formatDateTime(task.completedAt)}`,
    ];
    if (task.description !== undefined) {
      const description = sanitizeForTerminal(task.description, true)
        .split(/\r?\n/)
        .map((line) => `    ${line}`);
      lines.push('', '  説明:', ...description);
    }
    return `${lines.join('\n')}\n`;
  }

  private formatRow(
    cells: readonly string[],
    columnWidths: readonly number[],
    status?: TaskStatus
  ): string {
    const lastColumn = cells.length - 1;
    return cells
      .map((cell, column) => {
        const padding =
          column === lastColumn
            ? ''
            : ' '.repeat((columnWidths[column] ?? 0) - this.measureWidth(cell));
        // ステータス列のみ色を付ける。幅は色を付ける前の文字列で計算済み
        const text =
          column === 1 && status !== undefined
            ? this.colorStatus(cell, status)
            : cell;
        return text + padding;
      })
      .join(COLUMN_GAP);
  }

  private colorStatus(text: string, status: TaskStatus): string {
    switch (status) {
      case 'in_progress':
        return this.colors.yellow(text);
      case 'completed':
        return this.colors.green(text);
      case 'archived':
        return this.colors.dim(text);
      case 'open':
        return text;
    }
  }

  private truncate(text: string, maxWidth: number): string {
    if (this.measureWidth(text) <= maxWidth) {
      return text;
    }
    const limit = maxWidth - this.measureWidth(ELLIPSIS);
    let result = '';
    for (const character of text) {
      if (this.measureWidth(result + character) > limit) {
        break;
      }
      result += character;
    }
    return result + ELLIPSIS;
  }
}

/**
 * string-width を読み込んで TablePresenter を生成する。
 * string-width は一覧表示でのみ必要なため、起動時間を抑えるために遅延読み込みする。
 */
export async function createTablePresenter(
  color: boolean
): Promise<TablePresenter> {
  const { default: stringWidth } = await import('string-width');
  return new TablePresenter(color, stringWidth);
}

/**
 * ISO 8601 の日時を、ローカルタイムゾーンの `YYYY-MM-DD HH:mm` に変換する。
 */
export function formatDateTime(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    return isoDateTime;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
