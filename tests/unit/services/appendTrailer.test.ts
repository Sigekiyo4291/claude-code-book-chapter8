import { describe, expect, it } from 'vitest';
import { appendTrailer } from '../../../src/services/appendTrailer.js';

describe('appendTrailer', () => {
  it('件名のみのメッセージの場合、空行を挟んでトレーラーを追記する', () => {
    expect(appendTrailer('Add login endpoint\n', 1)).toBe(
      'Add login endpoint\n\nTask: #1\n'
    );
  });

  it('末尾に改行がないメッセージにも追記する', () => {
    expect(appendTrailer('Add login endpoint', 2)).toBe(
      'Add login endpoint\n\nTask: #2\n'
    );
  });

  it('既にタスクトレーラーがある場合、変更しない', () => {
    const message = 'Fix bug\n\nTask: #3\n';

    expect(appendTrailer(message, 1)).toBe(message);
  });

  it('最終段落が既存のトレーラーの場合、その末尾に続けて追記する', () => {
    const message =
      'Fix bug\n\nBody text.\n\nCo-Authored-By: A <a@example.com>\n';

    expect(appendTrailer(message, 4)).toBe(
      'Fix bug\n\nBody text.\n\nCo-Authored-By: A <a@example.com>\nTask: #4\n'
    );
  });

  it('git のコメント行がある場合、本文とコメントの間に追記する', () => {
    const message =
      'Add feature\n\n# Please enter the commit message for your changes.\n# On branch main\n';

    expect(appendTrailer(message, 5)).toBe(
      'Add feature\n\nTask: #5\n\n# Please enter the commit message for your changes.\n# On branch main\n'
    );
  });

  it('本文が空(コメントのみ)の場合、空メッセージによる中止を妨げないよう変更しない', () => {
    const message = '\n# Please enter the commit message for your changes.\n';

    expect(appendTrailer(message, 1)).toBe(message);
  });

  it('CRLF のメッセージも LF に揃えて追記する', () => {
    expect(appendTrailer('Subject\r\n', 6)).toBe('Subject\n\nTask: #6\n');
  });

  it('本文中に "Key: value" 形式の行が単独で含まれていても、件名のみの段落ならトレーラー扱いしない', () => {
    expect(appendTrailer('Fixes: something\n', 7)).toBe(
      'Fixes: something\n\nTask: #7\n'
    );
  });
});
