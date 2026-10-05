/**
 * 現在時刻の取得を抽象化する(テストで時刻を固定するため)。
 */
export interface Clock {
  /** ISO 8601(UTC)形式の現在時刻 */
  now(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};
