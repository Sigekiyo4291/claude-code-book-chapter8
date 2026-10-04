import picocolors from 'picocolors';

/**
 * 成功・警告・エラーメッセージを整形する。色がなくても記号で種別が分かるようにする。
 */
export class MessageFormatter {
  private readonly colors: ReturnType<typeof picocolors.createColors>;

  constructor(color: boolean) {
    this.colors = picocolors.createColors(color);
  }

  success(message: string): string {
    return `${this.colors.green('✓')} ${message}\n`;
  }

  warning(message: string): string {
    return `${this.colors.yellow('⚠')} ${message}\n`;
  }

  error(message: string, hint?: string): string {
    const lines = [`${this.colors.red('✗')} ${indentContinuation(message)}`];
    if (hint !== undefined) {
      lines.push(`  ${hint}`);
    }
    return `${lines.join('\n')}\n`;
  }

  info(message: string): string {
    return `${message}\n`;
  }
}

function indentContinuation(message: string): string {
  return message.split('\n').join('\n  ');
}
