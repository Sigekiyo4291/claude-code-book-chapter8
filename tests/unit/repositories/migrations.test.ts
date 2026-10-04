import { describe, expect, it } from 'vitest';
import { UnsupportedSchemaError } from '../../../src/domain/errors.js';
import { migrateToCurrent } from '../../../src/repositories/migrations.js';

describe('migrateToCurrent', () => {
  it('現行バージョンのデータはそのまま返す', () => {
    const data = { schemaVersion: 1, nextId: 1, tasks: [] };

    expect(migrateToCurrent(data)).toEqual(data);
  });

  it('schemaVersion を判別できないデータはそのまま返す', () => {
    expect(migrateToCurrent('text')).toBe('text');
    expect(migrateToCurrent({ tasks: [] })).toEqual({ tasks: [] });
  });

  it('現行より新しいバージョンの場合、UnsupportedSchemaError を送出する', () => {
    expect(() => migrateToCurrent({ schemaVersion: 2 })).toThrow(
      UnsupportedSchemaError
    );
  });
});
