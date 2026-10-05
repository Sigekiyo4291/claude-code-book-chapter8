import { CURRENT_SCHEMA_VERSION } from '../domain/Task.js';
import { UnsupportedSchemaError } from '../domain/errors.js';

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * schemaVersion N のデータを N + 1 に変換する関数を、キー N で登録する。
 * 現行は version 1 のみのため空。形式を変更する際にここへ追加する。
 */
const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/**
 * 古い形式のデータを現行の schemaVersion に変換する。
 * schemaVersion を判別できないデータはそのまま返し、後続の形式検証に任せる。
 *
 * @throws {UnsupportedSchemaError} 現行より新しい schemaVersion の場合
 */
export function migrateToCurrent(data: unknown): unknown {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('schemaVersion' in data) ||
    typeof data.schemaVersion !== 'number'
  ) {
    return data;
  }
  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaError(data.schemaVersion);
  }

  let migrated: Record<string, unknown> = { ...data };
  for (
    let version = data.schemaVersion;
    version < CURRENT_SCHEMA_VERSION;
    version++
  ) {
    const migration = MIGRATIONS[version];
    if (migration === undefined) {
      return migrated;
    }
    migrated = { ...migration(migrated), schemaVersion: version + 1 };
  }
  return migrated;
}
