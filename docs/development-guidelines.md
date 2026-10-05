# 開発ガイドライン (Development Guidelines)

本書は TaskCLI の実装・レビュー・リリースで守る規約を定める。技術スタックは [architecture.md](./architecture.md)、ディレクトリ構造は [repository-structure.md](./repository-structure.md) に従う。

## 基本方針

1. **ドキュメントが先、実装が後**: 実装前に `docs/` を読み、作業ごとに `.steering/[YYYYMMDD]-[作業名]/` で計画を立てる(CLAUDE.md のスペック駆動開発フロー)
2. **テストで仕様を固定する**: 新しい振る舞いはテストを先に書く(TDD)。バグ修正は再現テストから始める
3. **起動時間を守る**: CLIは1日に何十回も実行される。依存の追加・起動時の処理追加は、性能要件(コマンド処理100ms以内)への影響を確認してから行う
4. **利用者のリポジトリを壊さない**: TaskCLIは他人のGitリポジトリを操作する。データやGitの状態を変更する処理は、失敗時に元の状態を保つことを最優先とする

## コーディング規約

### TypeScript の基本

**厳格な型付け**:
- `tsconfig.json` の `strict: true` を維持する
- `any` は使用しない(ESLintで警告)。外部から来る値は `unknown` で受け取り、型ガードで絞り込む
- 型アサーション(`as`)は原則禁止。使う場合はコメントで安全である理由を書く
- 非nullアサーション(`!`)は使用しない

```typescript
// ✅ 良い例: unknown で受け取り、型ガードで検証する
const raw: unknown = JSON.parse(content);
if (!isTaskStore(raw)) {
  throw new CorruptedDataError(filePath, 'tasks.json の形式が不正です');
}
const store: TaskStore = raw;

// ❌ 悪い例: 検証せずにアサーションする
const store = JSON.parse(content) as TaskStore;
```

**型の定義**:
- オブジェクトの形は `interface`、ユニオン・リテラル型は `type` で定義する
- 列挙値は `enum` を使わず、`as const` の配列とユニオン型で定義する(実行時の値と型を一致させるため)

```typescript
// ✅ 良い例
export const TASK_STATUSES = ['open', 'in_progress', 'completed', 'archived'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// ❌ 悪い例: enum はトランスパイル結果が冗長で、JSON の文字列と比較しづらい
enum TaskStatus { Open = 'open', InProgress = 'in_progress' }
```

- 変更しないデータは `readonly` を付ける。サービスはタスクを破壊的に変更せず、新しいオブジェクトを返す

```typescript
// ✅ 良い例: 新しいオブジェクトを作る
const updated: Task = { ...task, status: 'completed', completedAt: now, updatedAt: now };

// ❌ 悪い例: 引数を書き換える
task.status = 'completed';
```

**モジュール**:
- ESM のみを使用する(`require` 禁止)
- 相対 import には `.js` 拡張子を付ける(`moduleResolution: NodeNext`)
- 型のみの import は `import type` を使う
- default export は使用しない(名前付き export に統一し、リネームによる不整合を防ぐ)

```typescript
// ✅ 良い例
import type { Task } from '../domain/Task.js';
import { TaskNotFoundError } from '../domain/errors.js';

// ❌ 悪い例
import Task from '../domain/Task';
```

### 命名規則

#### 変数・関数

```typescript
// ✅ 良い例
const archivedTaskCount = tasks.filter((task) => task.status === 'archived').length;
function generateBranchName(id: number, title: string): string { /* ... */ }
const isGitRepository = await git.isAvailable();

// ❌ 悪い例
const cnt = tasks.filter((t) => t.status === 'archived').length;
function branch(i: number, s: string): string { /* ... */ }
const git = await git.isAvailable();
```

| 種別 | 規則 | 例 |
|------|------|-----|
| 変数 | camelCase、名詞 | `currentBranch`, `taskStore` |
| 関数・メソッド | camelCase、動詞で始める | `createTask`, `parseTaskId` |
| 真偽値 | `is` / `has` / `should` / `can` で始める | `isGitRepository`, `hasConflict` |
| 定数 | UPPER_SNAKE_CASE | `TITLE_MAX_LENGTH`, `BRANCH_PREFIX` |
| クラス | PascalCase、名詞 | `TaskService`, `GitClient` |
| インターフェース | PascalCase、`I` 接頭辞なし | `Task`, `GitPort` |
| 型エイリアス | PascalCase | `TaskStatus`, `TaskAction` |
| エラークラス | PascalCase + `Error` | `TaskNotFoundError` |

**プロジェクト固有の命名**:
- ドメイン用語は [glossary.md](./glossary.md) の英語表記に合わせる(例: 「完了」は `complete` / `completed`。`done` は CLI のコマンド名としてのみ使う)
- サービスのメソッドは `動詞 + Task` とする(`createTask`, `startTask`, `archiveTask`)
- ポート(インターフェース)は `[対象]Port`、その実装は具体名とする(`GitPort` ← `GitClient`)
- ループ変数でも1文字名は使わない(`tasks.map((task) => ...)`)。ただしインデックスの `i` は可

### コードフォーマット

Prettier の設定(`.prettierrc`)に従い、手動で整形しない。

- **インデント**: 2スペース
- **行の長さ**: 最大80文字
- **クォート**: シングルクォート
- **セミコロン**: あり
- **末尾カンマ**: ES5 準拠(オブジェクト・配列のみ)

```typescript
// Prettier 適用後の例
export async function registerStartCommand(
  program: Command,
  createContext: ContextFactory
): Promise<void> {
  program
    .command('start <id>')
    .description('タスクを開始し、ブランチを作成して切り替えます')
    .option('-b, --branch <name>', 'ブランチ名を指定します')
    .action(async (rawId: string, options: { branch?: string }) => {
      const context = await createContext();
      const result = await context.taskService.startTask(parseTaskId(rawId), {
        branch: options.branch,
      });
      context.output.success(formatStartResult(result));
    });
}
```

### 関数・クラスの設計

- **1関数1責務**: 関数は50行以内を目安とする。超える場合は処理を抽出する
- **引数は3つまで**: 4つ以上になる場合はオプションオブジェクトにまとめる
- **早期リターン**: ネストは3段までとし、異常系を先に処理して返す
- **純粋関数を優先**: 状態遷移判定・ブランチ名生成・表示整形は、副作用のない関数・クラスとして実装する
- **時刻・乱数を直接呼ばない**: サービスでは `new Date()` を使わず `Clock` から取得する(テストで固定するため)

```typescript
// ✅ 良い例: 早期リターンでネストを浅く保つ
async startTask(id: number, options: StartTaskOptions): Promise<StartTaskResult> {
  const store = await this.repo.load();
  const task = findTaskOrThrow(store, id);
  const nextStatus = this.policy.next(task.status, 'start');

  if (!this.workspace.isGitRepository) {
    const updated = await this.saveStatus(store, task, nextStatus);
    return { task: updated, branchAction: 'skipped_no_git' };
  }

  const branch = await this.resolveBranchName(task, options);
  const branchAction = await this.checkoutBranch(branch);
  const updated = await this.saveStatus(store, task, nextStatus, branch);
  return { task: updated, branchAction };
}
```

### レイヤー規約

[repository-structure.md](./repository-structure.md) の依存ルールに従う。特に以下を守る。

| ルール | 理由 |
|--------|------|
| サービスで `console` / `process.stdout` を使わない | 出力形式の変更がビジネスロジックに波及しないようにするため |
| サービスで `node:fs` / `simple-git` を import しない | ポート経由にすることで、Gitなしでユニットテストできるようにするため |
| 依存の組み立ては `src/cli/context.ts` のみで行う | 依存関係を一箇所で把握できるようにするため |
| CLIレイヤーにビジネスルールを書かない | 例: 「`archived` は表示しない」はサービスの `listTasks` で判定する |

これらは ESLint の `no-restricted-imports` で検出する(下記「品質の自動化」参照)。

### 非同期処理

- `async` / `await` を使用し、`.then()` チェーンは使わない
- Promise を投げっぱなしにしない(`@typescript-eslint/no-floating-promises` で検出)
- 独立した処理は `Promise.all` で並列実行する

```typescript
// ✅ 良い例: 独立した読み込みを並列化する
const [tasks, currentBranch] = await Promise.all([
  context.taskService.listTasks({ includeArchived: options.all }),
  context.git.getCurrentBranch(),
]);
```

- 同期版のファイルAPI(`readFileSync` 等)は使用しない。例外として、テストヘルパーでは使用してよい

### エラーハンドリング

**原則**:
- 利用者の操作で起こり得るエラーは、すべて `TaskCliError` の派生クラスとして `src/domain/errors.ts` に定義する
- エラーには「何が起きたか」(`message`)と「どうすれば解決できるか」(`hint`)を必ず持たせる
- エラーの表示と終了コードの決定は `src/cli/errorHandler.ts` のみで行う。サービス・データレイヤーは例外を送出するだけにする
- 外部ライブラリの例外(simple-git、`fs` の `ENOENT` 等)は、インフラレイヤーで `TaskCliError` に変換する
- エラーを握りつぶさない。空の `catch` は禁止。例外として、`prepare-commit-msg` フックはコミットを妨げないため、警告を表示したうえで処理を継続する

```typescript
// src/domain/errors.ts
export abstract class TaskCliError extends Error {
  abstract readonly hint?: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class TaskNotFoundError extends TaskCliError {
  readonly hint = 'task list --all で既存のタスクを確認できます';

  constructor(readonly taskId: number) {
    super(`タスク #${taskId} が見つかりません`);
  }
}
```

```typescript
// ✅ 良い例: インフラレイヤーで変換し、Gitのエラー出力を保持する
async checkoutBranch(name: string): Promise<void> {
  try {
    await this.git.checkout(name);
  } catch (error) {
    throw new GitOperationError(
      `ブランチ ${name} に切り替えられませんでした`,
      toErrorMessage(error)
    );
  }
}

// ❌ 悪い例: 例外を握りつぶす
try {
  await this.git.checkout(name);
} catch {
  // 何もしない
}
```

**データ変更の順序**:
- Git操作など失敗し得る外部操作を先に行い、成功後に tasks.json を保存する
- 1コマンドで tasks.json を書き込むのは最後の1回のみとする

**メッセージの書き方**:
- 日本語で、主語を省いた簡潔な文にする
- 対象を特定できる情報(タスクID、ブランチ名、ファイルパス)を含める
- ヒントは実行可能なコマンドで示す

```
✅ ✗ タスク #1 は既に完了しています(completed)
     再開する場合は task start 1 を実行してください

❌ ✗ Error: invalid status transition
```

### コメント規約

- **export する関数・クラス・型には TSDoc を書く**。送出する例外は `@throws` に記載する
- **インラインコメントは「なぜ」を書く**。コードを読めば分かる「何を」は書かない
- `TODO` には担当者または Issue 番号を付ける(`// TODO(#12): GitHub 連携時に置き換える`)
- コメントアウトしたコードは残さない(Git の履歴で追える)

```typescript
/**
 * タスクを開始し、紐付くブランチを作成または切り替える。
 *
 * Git操作が成功した場合のみタスクを保存するため、失敗時にタスクは変更されない。
 *
 * @param id - 開始するタスクのID
 * @param options - ブランチ名の指定
 * @returns 更新後のタスクと、ブランチに対して行った操作
 * @throws {TaskNotFoundError} タスクが存在しない場合
 * @throws {InvalidStatusTransitionError} 開始できないステータスの場合
 * @throws {GitOperationError} ブランチの作成・切り替えに失敗した場合
 */
async startTask(id: number, options: StartTaskOptions): Promise<StartTaskResult>
```

```typescript
// ✅ 良い例: 理由を書く
// Windows では rename 先を他プロセスが開いていると EPERM になるため再試行する
await renameWithRetry(tempPath, filePath);

// ❌ 悪い例: コードの繰り返し
// ファイルをリネームする
await renameWithRetry(tempPath, filePath);
```

### セキュリティ

- **シェルを経由しない**: `child_process.exec` / `execSync` と `shell: true` は使用禁止。Git操作は `GitClient` 経由で simple-git を使う
- **ユーザー入力を検証する**: 入力値の検証は [architecture.md](./architecture.md) の「入力検証」の表に従い、規定のレイヤーで行う
- **端末出力を無害化する**: タイトル・説明を表示する際は `sanitizeForTerminal` を通す
- **機密情報を出力しない**: P1以降でトークンを扱う場合、ログ・エラーメッセージ・tasks.json に含めない
- **ネットワーク通信をしない**: MVPでは `fetch` / `http` を使用しない

### パフォーマンス

- **起動時に重い処理をしない**: トップレベルでのファイル読み込み・Git実行は禁止。simple-git・string-width はそれを使う関数内で動的 `import()` する
- **tasks.json の読み書きは1コマンド各1回まで**
- **Gitの呼び出し回数を増やさない**: 新しい Git 呼び出しを追加する場合は、PRで理由と所要時間を説明する
- **依存ライブラリの追加基準**: 以下をすべて満たす場合のみ追加し、PRで説明する
  1. Node.js 標準APIで50行以内に実装できない
  2. 推移的依存を含めたインストールサイズが500KB以下
  3. 直近1年以内にリリースがあり、週間ダウンロード数が10万以上
  4. `task --help` の実行時間を10ms以上悪化させない

### クロスプラットフォーム

- パスは `node:path` の `join` / `resolve` で組み立てる。`'/'` を連結しない
- テストでのパス比較は `path.resolve` で正規化してから行う
- 書き込む改行は `'\n'` に固定し、`os.EOL` は使わない(Git管理されるファイルの差分を防ぐため)
- 大文字小文字を区別しないファイルシステム(macOS・Windows)を考慮し、ファイル名の大文字小文字だけが異なるファイルを作らない

## テストコード規約

### テストの構造

- `describe` は「テスト対象のクラス・関数 > メソッド」、`it` は「条件の場合、期待結果」の形式で日本語で書く
- 本文は Given / When / Then のコメントで区切る
- 1つの `it` では1つの振る舞いを検証する

```typescript
describe('TaskService', () => {
  describe('startTask', () => {
    it('ブランチの切り替えに失敗した場合、タスクを変更しない', async () => {
      // Given
      const repo = new InMemoryTaskRepository([openTask({ id: 1 })]);
      const git = new FakeGit({ failCheckout: true });
      const service = createTaskService({ repo, git });

      // When
      const promise = service.startTask(1, {});

      // Then
      await expect(promise).rejects.toThrow(GitOperationError);
      expect((await repo.load()).tasks[0].status).toBe('open');
    });
  });
});
```

### テストダブル

- サービスのユニットテストでは、`tests/helpers/fakes.ts` のインメモリ実装(`InMemoryTaskRepository`・`FakeGit`・`FixedClock`)を使う
- `vi.mock` によるモジュール差し替えは、ポートで差し替えられない場合に限る(依存性注入で差し替えられる設計を優先する)
- ビジネスロジック(`StatusTransitionPolicy`・`BranchNameGenerator`)はモックせず実物を使う
- 統合テスト・E2Eテストでは Git をモックせず、一時ディレクトリの実リポジトリを使う

### テストの独立性

- テストは実行順序に依存しない。各テストで一時ディレクトリを作成し、`afterEach` で削除する
- 開発者の Git 設定に影響されないよう、統合・E2Eテストでは環境変数 `GIT_CONFIG_GLOBAL` を空ファイルに、`HOME` を一時ディレクトリに設定する
- 現在時刻・タイムゾーンに依存する表示のテストは、`FixedClock` と `TZ=UTC` で固定する

### カバレッジ目標

| 対象 | 目標 | 強制方法 |
|------|------|---------|
| 全体(行・分岐・関数・ステートメント) | 80%以上 | `vitest.config.ts` の `thresholds` |
| `src/services/` | 90%以上 | `vitest.config.ts` のディレクトリ別 `thresholds` |
| `src/cli/index.ts`, `src/cli/context.ts` | 対象外 | E2Eテストで担保 |
| E2E | PRD の P0 受け入れ条件をすべて1回以上通過 | レビューで確認 |

**テストの比率の目安**: ユニット 70% / 統合 20% / E2E 10%(テストケース数)

## Git運用ルール

### ブランチ戦略(Git Flow)

```
main(リリース済みの安定版。タグでバージョン管理)
└── develop(次期リリースの統合ブランチ)
    ├── feature/[機能名]     # 新機能
    ├── fix/[修正内容]       # バグ修正
    ├── refactor/[対象]      # リファクタリング
    └── docs/[対象]          # ドキュメントのみの変更
```

- `feature/*` 等は `develop` から分岐し、PR で `develop` にマージする
- `main` と `develop` への直接コミットは禁止(ブランチ保護で強制)
- マージ方式: `feature/*` → `develop` は squash merge、`develop` → `main` は merge commit
- ブランチ名は kebab-case の英語とする(例: `feature/task-start-command`)
- TaskCLI の開発自体に TaskCLI を使う場合は、`task start` が生成する `feature/task-<id>-<slug>` 形式も可とする

### コミットメッセージ規約(Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type**:
| type | 用途 | バージョンへの影響 |
|------|------|-------------------|
| `feat` | 新機能 | minor |
| `fix` | バグ修正 | patch |
| `perf` | 性能改善 | patch |
| `refactor` | 振る舞いを変えないコード変更 | なし |
| `test` | テストの追加・修正 | なし |
| `docs` | ドキュメント | なし |
| `build` | ビルド・依存関係 | なし |
| `ci` | CI設定 | なし |
| `chore` | その他 | なし |

**scope**: `cli` / `service` / `repository` / `git` / `hook` / `docs` など変更したレイヤー・機能

**subject**: 日本語で50文字以内、体言止めまたは「〜を追加」の形。末尾に句点を付けない

**破壊的変更**: tasks.json の形式変更(`schemaVersion` の更新)やコマンドの互換性を壊す変更は、footer に `BREAKING CHANGE:` を記載する

```
feat(cli): task start コマンドを追加

タスクを開始すると feature/task-<id>-<slug> ブランチを作成して切り替える。
Git操作に失敗した場合はタスクのステータスを変更しない。

Refs #4
```

### プルリクエスト

**作成前のチェック**:
- [ ] `npm run lint` がエラーなし
- [ ] `npm run typecheck` がエラーなし
- [ ] `npm run test:coverage` が成功し、カバレッジ目標を満たす
- [ ] `npm run test:e2e` が成功する
- [ ] 関連する `docs/` を更新した(仕様に変更がある場合)
- [ ] `.steering/` の tasklist.md がすべて完了している

**PRテンプレート**(`.github/pull_request_template.md`):
```markdown
## 変更の種類
- [ ] 新機能 (feat)
- [ ] バグ修正 (fix)
- [ ] リファクタリング (refactor)
- [ ] ドキュメント (docs)
- [ ] その他 (chore / build / ci)

## 何を変更したか

## なぜ変更したか

## どのように変更したか
-

## テスト
- [ ] ユニットテストを追加・更新した
- [ ] 統合テストを追加・更新した(Git操作を変更した場合)
- [ ] E2Eテストを追加・更新した(コマンドの入出力を変更した場合)
- [ ] 手動で動作確認した(OS: )

## 性能への影響
- [ ] 依存ライブラリを追加していない
- [ ] Git の呼び出し回数を増やしていない

## 関連ドキュメント・Issue
- Closes #
```

**PRの大きさ**: 変更行数(テストを除く)400行以内を目安とする。超える場合は分割する

### コードレビュー

**レビューの観点**:

| 観点 | 確認内容 |
|------|---------|
| 仕様 | PRD の受け入れ条件・機能設計書の仕様を満たしているか |
| データ安全性 | 失敗時に tasks.json と Git の状態が元のままか。破壊的操作に確認があるか |
| レイヤー | 依存ルールを守っているか。サービスに入出力が入り込んでいないか |
| エラー | `TaskCliError` 派生で、message と hint が具体的か |
| テスト | 異常系(存在しないID、不正な遷移、Git失敗)がテストされているか |
| 性能 | 起動時の import、Git の呼び出し回数、ファイル I/O の回数が増えていないか |
| 互換性 | Windows のパス・改行で動くか。tasks.json の形式を変える場合はマイグレーションがあるか |

**コメントの優先度表記**:
- `[必須]`: マージ前に修正が必要
- `[推奨]`: 修正を推奨するが、理由があれば見送り可
- `[提案]`: 検討してほしい代替案
- `[質問]`: 理解のための質問

```markdown
✅ [必須] checkout より先に repo.save() を呼んでいるため、checkout が失敗すると
   タスクだけ in_progress になります。checkout の成功後に保存する順序にしてください。

❌ ここおかしいです。
```

**レビュー時間**: PR作成から1営業日以内に初回レビューを行う

## 品質の自動化

### npm scripts

| コマンド | 内容 |
|---------|------|
| `npm run build` | `tsc` で `dist/` にコンパイル |
| `npm run lint` | ESLint |
| `npm run format` | Prettier で整形 |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.test.json`(src と tests を型チェック) |
| `npm test` | ユニット・統合テスト |
| `npm run test:coverage` | カバレッジ付きテスト(閾値未満で失敗) |
| `npm run test:e2e` | ビルド後に E2E テストを実行 |

### コミット前(husky + lint-staged)

`.husky/pre-commit` で以下を実行する(既存設定):
- 変更された `*.ts` に `eslint --fix` と `prettier --write`
- `npm run typecheck`

### ESLint の追加ルール

既存の `eslint.config.js` に以下を追加する。

| ルール | 設定 | 目的 |
|--------|------|------|
| `@typescript-eslint/no-explicit-any` | `error`(現在 `warn`) | `any` の禁止 |
| `@typescript-eslint/no-floating-promises` | `error` | Promise の投げっぱなし防止(型情報付き lint が必要) |
| `@typescript-eslint/consistent-type-imports` | `error` | `import type` の強制 |
| `no-restricted-imports`(`src/services/**`) | `src/cli/**`・`src/repositories/**`・`src/infra/**`・`node:fs*`・`node:child_process`・`simple-git` を禁止 | レイヤー規約 |
| `no-restricted-imports`(`src/domain/**`) | `src/` 内の他ディレクトリ・外部ライブラリをすべて禁止 | ドメインの独立性 |
| `no-restricted-imports`(`src/cli/**`、`context.ts` 除く) | `src/repositories/**`・`src/infra/**` を禁止 | コンポジションルートへの集約 |
| `no-restricted-syntax` | `child_process` の `exec` / `execSync` を禁止 | コマンドインジェクション防止 |
| `no-console` | `error`(`src/cli/io/Output.ts` を除く) | 出力経路の一本化 |

### CI(GitHub Actions)

`.github/workflows/ci.yml` で、PR と `develop` / `main` への push 時に実行する。

```
npm ci → lint → typecheck → test:coverage → build → test:e2e → npm audit
```

- マトリクス: `ubuntu-latest` / `macos-latest` / `windows-latest` × Node.js `20` / `22` / `24`
- すべてのジョブの成功をマージ条件とする

## リリース

- バージョンは Semantic Versioning に従い、Conventional Commits の type から決定する
- `develop` → `main` のマージ後、`main` で `npm version <major|minor|patch>` を実行し、タグ `v1.2.3` を push する
- タグの push を契機に CI が `npm publish` を行う
- tasks.json の `schemaVersion` を上げる変更は minor 以上とし、リリースノートにマイグレーションの有無を記載する

## 開発環境セットアップ

### 必要なツール

| ツール | バージョン | 備考 |
|--------|-----------|------|
| Node.js | 24.11.0(開発)/ 20以降(動作確認) | devcontainer に同梱 |
| npm | 11.x | Node.js に同梱 |
| Git | 2.30以降 | 統合・E2Eテストで使用 |
| VS Code + Dev Containers | 最新 | 推奨 |

### セットアップ手順

```bash
# 1. リポジトリをクローンし、VS Code の「Reopen in Container」で開く
git clone <repository-url>
cd claude-code-book-chapter8

# 2. 依存関係をインストール(husky のフックも設定される)
npm ci

# 3. テストとビルドが通ることを確認
npm test
npm run build

# 4. 開発中の CLI をグローバルコマンドとして試す
npm link
task --help
```

`npm link` 後に本リポジトリ内で `task` を試すと `.task/` が作成される。`.task/` は `.gitignore` 済みだが、動作確認は一時ディレクトリで行うことを推奨する。

```bash
cd "$(mktemp -d)" && git init && task add "動作確認"
```

### 推奨 VS Code 拡張

- ESLint(`dbaeumer.vscode-eslint`): 保存時に lint 結果を表示
- Prettier(`esbenp.prettier-vscode`): 保存時に整形
- Vitest(`vitest.explorer`): テストの個別実行

## チェックリスト(実装完了時)

- [ ] 関連する `docs/` を読み、仕様どおりに実装した
- [ ] 命名が [glossary.md](./glossary.md) の用語と一致している
- [ ] レイヤーの依存ルールを守っている
- [ ] 利用者が起こし得るエラーはすべて `TaskCliError` 派生で、hint がある
- [ ] 失敗時に tasks.json と Git の状態が変わらない
- [ ] 正常系・異常系のテストがある
- [ ] lint・型チェック・テスト・E2E がすべて成功する
- [ ] 起動時の import と Git の呼び出しを増やしていない
