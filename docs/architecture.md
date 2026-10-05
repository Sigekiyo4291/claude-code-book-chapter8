# 技術仕様書 (Architecture Design Document)

本書は [プロダクト要求定義書](./product-requirements.md) の非機能要件と [機能設計書](./functional-design.md) のコンポーネント設計を、技術的にどう実現するかを定義する。

## テクノロジースタック

### 言語・ランタイム

| 技術 | バージョン | 選定理由 |
|------|-----------|----------|
| Node.js(開発環境) | v24.11.0 | devcontainerの標準。最新LTSで開発・テストする |
| Node.js(サポート対象) | 20.x 以降 | PRDの互換性要件。`engines` フィールドで `>=20` を宣言し、CIで 20 / 22 / 24 を検証する |
| TypeScript | 5.x(`~5.3.0`) | 静的型付けによりデータモデル・エラー型を明確化できる。プロジェクトの既存設定 |
| npm | 11.x | Node.js v24に同梱され追加インストール不要。`package-lock.json` で依存を厳密に固定できる |

**モジュール形式**: ESM(`"type": "module"`)。採用する主要ライブラリ(string-width 等)がESM専用であるため。

### フレームワーク・ライブラリ(dependencies)

| 技術 | バージョン | 用途 | 選定理由 |
|------|-----------|------|----------|
| commander | ^14.0.0 | CLI引数解析、サブコマンド、ヘルプ生成 | 学習コストが低く依存ゼロで軽量。類似コマンド提案(`showSuggestionAfterError`)・ヘルプのカスタマイズを標準で備える。oclifはプラグイン基盤を含み起動が重く、MVPには過剰 |
| simple-git | ^3.27.0 | Git操作(ブランチ作成・切り替え・ルート取得等) | gitを引数配列で `spawn` するためシェルを経由せず、コマンドインジェクションを防げる。エラー時にGitの標準エラー出力を取得できる。isomorphic-git(純JS実装)はフック・`core.hooksPath` 等のGit設定との整合が取れないため不採用 |
| string-width | ^7.2.0 | 全角文字を含む文字列の表示幅計算 | East Asian Width と絵文字・ANSIエスケープを正しく扱える事実上の標準。v7はNode 18以降対応 |
| picocolors | ^1.1.0 | 端末出力の色付け | 依存ゼロ・約3KBで起動時間への影響が最小。`NO_COLOR` と非TTYを自動判定する。chalkより軽量 |

**ライブラリを追加しない判断**:
- **確認プロンプト**: Node.js標準の `node:readline/promises` で実装する(inquirer等は起動時間とサイズの負担が大きい)
- **スキーマ検証**: TaskStore は単純な構造のため、型ガード関数を自作する(zod等は約50KBの追加と読み込み時間を要する)
- **ファイル操作**: `node:fs/promises` の `writeFile` + `rename` でアトミック書き込みを実装する(write-file-atomic等は不要)

### 開発ツール(devDependencies)

| 技術 | バージョン | 用途 | 選定理由 |
|------|-----------|------|----------|
| TypeScript | ~5.3.0 | コンパイル(`tsc`) | 単一パッケージのCLIであり、バンドラーを使わず `tsc` の出力をそのまま配布できる |
| Vitest | ^2.0.0 | ユニット・統合・E2Eテスト | ESM・TypeScriptをそのまま実行でき設定が少ない。v8カバレッジを標準で利用可能 |
| @vitest/coverage-v8 | ^2.0.0 | カバレッジ計測 | 計装不要で高速 |
| ESLint + typescript-eslint | ^9.0.0 / ^8.0.0 | 静的解析 | プロジェクトの既存設定(Flat Config) |
| Prettier | ^3.2.0 | コード整形 | プロジェクトの既存設定。ESLintとは `eslint-config-prettier` で競合を回避 |
| husky + lint-staged | ^9.0.0 / ^15.2.0 | コミット前の lint・整形 | プロジェクトの既存設定 |
| @types/node | ^20.11.0 | Node.js型定義 | サポート対象の最小バージョン(20)のAPIのみを使うことを型で保証する |

### TypeScript設定の方針

既存の `tsconfig.json` を基本とし、Node.jsで直接実行するESM CLIとして以下を変更する。

| 項目 | 現在 | 変更後 | 理由 |
|------|------|--------|------|
| `module` | `ESNext` | `NodeNext` | `tsc` の出力をNode.jsがそのまま解釈できる形にする |
| `moduleResolution` | `bundler` | `NodeNext` | バンドラーを使わないため、相対importに `.js` 拡張子を強制し実行時の解決エラーを防ぐ |
| `declaration` | なし | `false`(明示) | ライブラリとして公開しないため型定義は出力しない |

`strict: true`、`noUnusedLocals`、`noUnusedParameters` は維持する。

## アーキテクチャパターン

### レイヤードアーキテクチャ

```
┌──────────────────────────────────────┐
│   CLIレイヤー (src/cli)                │ ← 引数解析・出力整形・プロンプト・終了コード
├──────────────────────────────────────┤
│   サービスレイヤー (src/services)       │ ← ユースケース・状態遷移・ブランチ名生成
├──────────────────────────────────────┤
│   データ・インフラレイヤー               │ ← tasks.json の読み書き、Git操作
│   (src/repositories, src/infra)        │
└──────────────────────────────────────┘
        ↑ すべてのレイヤーが参照可能
┌──────────────────────────────────────┐
│   ドメイン型 (src/domain)              │ ← Task / TaskStatus / エラー型(依存なし)
└──────────────────────────────────────┘
```

#### CLIレイヤー
- **責務**: 引数の解析と形式チェック、サービスの呼び出し、結果の整形・表示、確認プロンプト、例外から終了コードへの変換
- **許可される操作**: サービスレイヤーの呼び出し、ドメイン型の参照、`process.stdout` / `process.stderr` / `process.exitCode` の操作
- **禁止される操作**: TaskRepository・JsonFileStorage への直接アクセス、ビジネスルール(状態遷移判定等)の実装

#### サービスレイヤー
- **責務**: ユースケースの実行、ステータス遷移の判定、ブランチ名の生成・検証、Git操作とデータ保存の順序制御
- **許可される操作**: リポジトリ・インフラのインターフェース呼び出し、ドメイン型の参照
- **禁止される操作**: 標準入出力・`process` への依存、CLIレイヤーへの依存、`node:fs` の直接使用

#### データ・インフラレイヤー
- **責務**: tasks.json のアトミックな読み書き・バックアップ・形式検証、Gitコマンドの実行
- **許可される操作**: ファイルシステム(`node:fs/promises`)、子プロセス(simple-git 経由)へのアクセス
- **禁止される操作**: ビジネスルールの実装、サービス・CLIレイヤーへの依存

#### ドメイン型
- **責務**: Task・TaskStore・TaskStatus の型定義、`TaskCliError` 派生のエラークラス
- **禁止される操作**: 他レイヤーおよび外部ライブラリへの依存

### 依存性の注入

サービスはコンストラクタでリポジトリ・GitClient・Clock を受け取る。依存の組み立てはCLIレイヤーのエントリポイント(コンポジションルート)でのみ行い、DIコンテナは使用しない。これにより、サービスのユニットテストでテストダブルへの差し替えが容易になる。

```typescript
// src/cli/context.ts(コンポジションルート)
export async function createContext(cwd: string): Promise<CommandContext> {
  const workspace = await new WorkspaceResolver().resolve(cwd);
  const repo = new TaskRepository(new JsonFileStorage(join(workspace.dataDir, 'tasks.json')));
  const git = new GitClient(workspace.rootDir);
  const taskService = new TaskService(repo, git, workspace,
    new StatusTransitionPolicy(), new BranchNameGenerator(git), systemClock);
  // ...
}
```

### 依存ルールの強制

レイヤー違反は ESLint の `no-restricted-imports` で検出する(例: `src/services/**` から `src/cli/**` と `node:fs` の import を禁止)。具体的なルールは [development-guidelines.md](./development-guidelines.md) で定義する。

## 実行モデル

### プロセスのライフサイクル

TaskCLIは常駐プロセスを持たず、1コマンド = 1プロセスで実行される。

```
起動 → 引数解析 → Workspace解決(git rev-parse) → tasks.json 読み込み
    → ユースケース実行 → tasks.json 書き込み(変更時のみ) → 出力 → 終了
```

- 状態はすべて `tasks.json` とGitリポジトリに保持し、プロセス内キャッシュは持たない
- 終了は `process.exit()` ではなく `process.exitCode` の設定で行い、標準出力のフラッシュ漏れを防ぐ

### 起動時間の最適化

| 対策 | 内容 |
|------|------|
| 依存ライブラリの最小化 | dependencies を4つに限定し、いずれも依存ゼロまたは軽量なものを選定 |
| 遅延読み込み | simple-git・string-width はそれらを使う処理の中で動的 `import()` する。`task --help` / `--version` ではこれらを読み込まない |
| バンドルしない | `tsc` 出力をそのまま配布し、ソースマップは同梱しない(ファイル読み込み量の削減) |

### 同時実行

- 同一リポジトリで複数の `task` コマンドが同時に実行された場合、**後から書き込んだ内容が優先される(last-write-wins)**。アトミック書き込みによりファイル自体が破損することはない
  - 例: 2つのターミナルで同時に `task add` すると、一方の追加が失われる(同じIDが採番され得る)。人間による逐次操作では起こらないため許容する
- アトミック書き込みはプロセスの強制終了に対して安全だが、`fsync` は行わないため、OSクラッシュ・電源断の直後には書き込みが失われ得る(直前の状態は `.bak` に残る)
- MVPではファイルロックを実装しない。CLIは人間が逐次操作する前提であり、ロックによる複雑さ(異常終了時の残留ロック等)が利点を上回るため
- `prepare-commit-msg` フックは tasks.json を読むのみで書き込まないため、競合しない

## データ永続化戦略

### ストレージ方式

| データ種別 | ストレージ | フォーマット | 理由 |
|-----------|----------|-------------|------|
| タスクデータ | `<rootDir>/.task/tasks.json` | JSON(2スペースインデント、末尾改行、UTF-8、LF) | 追加ソフトウェア不要。人間が読め、Gitの差分・マージで扱いやすい |
| バックアップ | `<rootDir>/.task/tasks.json.bak` | 同上 | 直前の状態への手動復元用 |
| ブランチ紐付け | `Task.branch`(tasks.json 内) | 文字列 | Git側に独自メタデータ(git notes 等)を持たず、Git操作の副作用を最小化する |
| フックスクリプト | `<git hooks dir>/prepare-commit-msg` | POSIX sh | Gitの標準的な拡張点。Git Bash を含む全OSで動作する |

**JSONを選択しSQLiteを採用しない理由**: 1,000件(約300KB)の読み込み・解析は数msで完了し、PRDの性能要件を満たす。SQLiteはネイティブモジュールのビルドやバイナリ配布が必要になり、導入容易性を損なう。また、バイナリ形式ではGitでの共有・差分確認ができない。

**改行コード**: Windows環境で `core.autocrlf` によりCRLFに変換された tasks.json も読み込めるようにする(`JSON.parse` は CRLF を許容する)。書き込みは常にLFとし、`task init` で作成する `.task/.gitattributes` に `tasks.json text eol=lf` を記載する。

### スキーママイグレーション

- `schemaVersion` を読み込み時に確認し、現行より古い場合はメモリ上で順次マイグレーションしてから処理する。保存時に現行バージョンで書き出す
- マイグレーション前の内容は通常の書き込み手順により `.bak` に残る
- 現行より新しい場合は `UnsupportedSchemaError` とし、書き込まない(古いバージョンのツールによるデータ破壊を防ぐ)

### バックアップ戦略

- **頻度**: tasks.json への書き込みのたびに、書き込み直前の状態を保存する
- **保存先**: `.task/tasks.json.bak`(`.task/.gitignore` によりGit管理外)
- **世代管理**: 1世代のみ保持する。誤操作の直後に気付けば復元できることを目的とし、それ以前の履歴は tasks.json をGitにコミットすることで管理できるため
- **復元方法**: `cp .task/tasks.json.bak .task/tasks.json`(Windowsでは `copy`)。tasks.json の破損検知時には、この手順をエラーメッセージで案内する

### 書き込み手順(アトミック性の保証)

```
1. mkdir -p .task
2. copyFile(tasks.json → tasks.json.bak)        ※ tasks.json が存在する場合
3. writeFile(tasks.json.<pid>.<random>.tmp)
4. rename(tmp → tasks.json)                     ※ 同一ディレクトリ内のためアトミック
5. (失敗時)unlink(tmp)
```

ステップ3〜4の間に強制終了しても、tasks.json は書き込み前の完全な状態を保つ。Windowsで `rename` が `EPERM` / `EBUSY` で失敗した場合は、50ms間隔で最大3回再試行する。

## Git連携アーキテクチャ

### Git操作の一覧

| 操作 | 実行するgitコマンド | 使用箇所 |
|------|-------------------|---------|
| リポジトリルート取得 | `git rev-parse --show-toplevel` | 全コマンドの Workspace 解決 |
| 現在ブランチ取得 | `git symbolic-ref --short -q HEAD` | `task list`(マーカー表示)、フック |
| ブランチ存在確認 | `git show-ref --verify --quiet refs/heads/<name>` | `task start` |
| ブランチ作成・切り替え | `git checkout -b <name>` / `git checkout <name>` | `task start` |
| ブランチ名検証 | `git check-ref-format --branch <name>` | `task start --branch` |
| フックディレクトリ取得 | `git rev-parse --git-path hooks` | `task hook install / uninstall` |

`git switch` ではなく `git checkout` を使用するのは、PRDの最小対応バージョン(Git 2.30)より古い環境でも誤動作しないようにするためである(`switch` は 2.23 以降で利用可能だが experimental 扱いの期間があった)。

### Gitが利用できない場合

- `git` コマンドが存在しない場合、`git rev-parse` の実行が `ENOENT` で失敗するため、WorkspaceResolver はリポジトリ外として扱う
- これにより「Git未インストール環境でも基本操作が動作する」(PRD機能6)を、特別な分岐なしで満たす

### コミットフックの設計

- フックスクリプトは `task hook run` を呼ぶだけの薄いシェルスクリプトとし、ロジックはすべてTypeScript側に置く(OS間の差異とテスト困難性を避けるため)
- `task` がPATHにない環境(GUIのGitクライアント等)では何もせず終了し、コミットを妨げない
- フック実行時は書き込みを行わず、tasks.json の読み込みと現在ブランチの取得のみを行う

## パフォーマンス要件

### レスポンスタイム

| 操作 | 目標時間 | 計測範囲 | 測定条件 |
|------|---------|---------|---------|
| add / show / done / archive / delete | 100ms以内 | コマンド処理(Node.js起動を除く) | タスク100件 |
| list | 100ms以内 | 同上 | タスク100件 |
| list | 1秒以内 | 同上 | タスク1,000件 |
| start | 500ms以内 | 同上 | タスク100件、コミット1万件のリポジトリ |
| prepare-commit-msg フック | 200ms以内 | Node.js起動を含むフック全体 | タスク100件 |
| `task --help` | 150ms以内 | Node.js起動を含む | - |

**測定環境**: 4コア以上のCPU、メモリ8GB以上、SSD(PRDの基準環境)。CIでは環境差を考慮し、目標値の2倍を上限とする回帰テストとして扱う。

**測定方法**:
- コマンド処理時間: エントリポイントの先頭と終了直前で `performance.now()` を記録し、`TASKCLI_DEBUG=1` 指定時に標準エラー出力へ表示する
- 起動を含む時間: E2Eテストで子プロセスの開始から終了までを計測する(10回実行の中央値)

**処理時間の内訳見積もり(タスク1,000件の `task list`)**:
| 処理 | 見積もり |
|------|---------|
| `git rev-parse` × 2(ルート取得・現在ブランチ) | 約20ms |
| tasks.json(約300KB)の読み込み・解析・検証 | 約10ms |
| 表示幅計算と整形(1,000行) | 約20ms |
| 標準出力への書き込み | 約10ms |
| **合計** | **約60ms**(目標1秒に対し十分な余裕) |

### リソース使用量

| リソース | 上限 | 理由 |
|---------|------|------|
| メモリ | 100MB(RSS) | Node.jsの基本使用量(約40MB)+ タスク1,000件のデータ。CLIとして他の開発ツールを圧迫しない |
| CPU | 単一コア、コマンド実行中のみ | 常駐プロセスなし |
| ディスク(インストール) | 5MB以内 | 依存ライブラリ4つの合計 |
| ディスク(データ) | タスク1,000件で約600KB(tasks.json + .bak) | 1タスクあたり約300バイト |

## セキュリティアーキテクチャ

### データ保護

- **暗号化**: 行わない。tasks.json はソースコードと同じくリポジトリ内のデータであり、Gitでの共有を想定しているため。機密情報をタスクに記載しないよう README で注意喚起する
- **アクセス制御**: ファイルは作成時の umask に従う(リポジトリ内の他ファイルと同じ扱い)。フックスクリプトのみ実行権限 `0755` を付与する
- **機密情報管理**: MVPでは認証情報を扱わない。P1のGitHub連携では、トークンを環境変数 `GITHUB_TOKEN` または `gh auth token` から取得し、tasks.json・ログ・エラーメッセージに出力しない

### 入力検証

| 入力 | 検証内容 | 検証箇所 |
|------|---------|---------|
| タスクID | `/^#?[1-9]\d*$/`、`Number.MAX_SAFE_INTEGER` 以下 | CLIレイヤー |
| タイトル | トリム後1〜200文字、改行は空白に置換 | サービスレイヤー |
| 説明 | 10,000文字以下 | サービスレイヤー |
| ブランチ名(`--branch`) | 先頭 `-` を拒否、`git check-ref-format --branch` | サービスレイヤー(BranchNameGenerator) |
| tasks.json | JSON構文、`schemaVersion`、各フィールドの型 | データレイヤー(型ガード) |

- **サニタイゼーション**: ユーザー入力をシェルに渡さないため、エスケープ処理は不要な設計とする。端末出力時、タイトル・説明に含まれる制御文字(`\x00-\x1F`、`\x7F`、ただし説明中の改行・タブを除く)は表示前に除去し、エスケープシーケンスによる端末表示の改ざんを防ぐ
- **エラーハンドリング**: 通常時はエラーメッセージとヒントのみを表示し、スタックトレースは `TASKCLI_DEBUG=1` 指定時のみ表示する

### サプライチェーン

- dependencies を4つに限定し、いずれも広く利用され保守が継続しているものに限る
- `package-lock.json` をコミットし、CIでは `npm ci` を使用する
- CIで `npm audit --omit=dev --audit-level=high` を実行し、高リスクの脆弱性があればビルドを失敗させる

## スケーラビリティ設計

### データ増加への対応

- **想定データ量**: 1リポジトリあたり1,000件まで性能要件を保証。1万件(約3MB)でも動作はする(`task list` 数百ms程度の見込み)が保証対象外
- **パフォーマンス劣化対策**: 1万件超が必要になった場合は、TaskRepository の実装をSQLiteに差し替える。サービスレイヤーは TaskRepository のインターフェースのみに依存しているため、変更範囲はデータレイヤーに限定される
- **アーカイブ戦略**: `archived` のタスクも tasks.json に保持する(`task list` のデフォルト表示から除外するのみ)。将来的に件数が問題になった場合は、`archived` を別ファイル(`.task/archive.json`)に分離する

### 機能拡張性

- **P1機能への備え**:
  - 優先度・期限: Task にオプショナルフィールドを追加し、`schemaVersion` を上げてマイグレーションで既定値を補う
  - GitHub連携: `src/infra/github/` に GitHubClient を追加し、サービスレイヤーから利用する。CLI・データレイヤーの変更は不要
  - 完了時の自動処理: GitClient にマージ・プッシュ操作を追加し、TaskService.completeTask にオプションとして組み込む
- **プラグインシステム**: MVPでは提供しない(PRDのスコープ外)
- **設定のカスタマイズ**: MVPでは設定ファイルを持たない。ブランチ名の接頭辞等を設定可能にする場合は `.task/config.json` を追加する

## テスト戦略

### ユニットテスト
- **フレームワーク**: Vitest
- **対象**: サービスレイヤー(TaskService・StatusTransitionPolicy・BranchNameGenerator・CommitHookService)、CLIの出力整形(TablePresenter)、データレイヤー(JsonFileStorage・型ガード)
- **方針**: GitClient・TaskRepository・Clock はテストダブルに差し替える。JsonFileStorage は一時ディレクトリ(`os.tmpdir()` 配下)の実ファイルでテストする
- **カバレッジ目標**: 行・分岐・関数・ステートメントそれぞれ80%以上(`vitest.config.ts` の `thresholds` で強制)

### 統合テスト
- **方法**: テストごとに一時ディレクトリで `git init` を実行し、実際のGitに対してサービスとデータレイヤーを結合して実行する。テスト用に `user.name` / `user.email` をリポジトリローカルに設定する
- **対象**: ブランチ作成・切り替え、checkout失敗時のデータ不変性、フックの導入と `git commit` 時のトレーラー付与、サブディレクトリからのルート解決、リポジトリ外での動作

### E2Eテスト
- **ツール**: Vitest + `node:child_process`(`execFile`)。ビルド済みの `dist/cli/index.js` を子プロセスで実行する
- **シナリオ**: 基本フロー(init → add → list → start → commit → done → archive)、エラー時の出力と終了コード、削除確認プロンプト(標準入力に `y` / `n` を渡す)、非TTY・`NO_COLOR` での無色出力、1,000件データでの性能

### CI
- GitHub Actions で `lint` → `typecheck` → `test:coverage` → `build` → E2E を実行する
- マトリクス: OS(ubuntu-latest / macos-latest / windows-latest)× Node.js(20 / 22 / 24)

## 技術的制約

### 環境要件
- **OS**: macOS(最新2メジャーバージョン)、Linux(Ubuntu 22.04以降)、Windows 10/11(PowerShell・Git Bash)
- **Node.js**: 20.x 以降
- **最小メモリ**: 空きメモリ100MB
- **必要ディスク容量**: 5MB(インストール時)
- **必要な外部依存**: Git 2.30以降(Git連携機能のみ。基本操作には不要)

### パフォーマンス制約
- Node.jsの起動時間(約40〜60ms)は削減できないため、PRDの「100ms以内」はNode.js起動を除くコマンド処理時間として定義している
- Gitの操作時間はリポジトリの規模とファイルシステムに依存するため、`task start` の目標値はGit操作を含めて別に定義している

### セキュリティ制約
- ユーザー入力をシェルコマンド文字列に連結してはならない(`child_process.exec` の使用禁止、`execFile` / simple-git のみ使用)
- MVPではネットワーク通信を行うコードを含めてはならない

### クロスプラットフォーム制約
- パスの組み立ては `node:path` の `join` / `resolve` を使用し、区切り文字をハードコードしない
- 改行は書き込み時LF固定、読み込み時はCRLF / LFの両方を受け付ける
- フックスクリプトはPOSIX sh の範囲で記述する(Git for Windows 同梱の sh で実行されるため)
- ファイルの実行権限付与(`chmod`)はWindowsでは効果がないが、Git for Windows はフックを権限に関係なく実行するため問題ない

## 依存関係管理

| ライブラリ | 種別 | 用途 | バージョン管理方針 |
|-----------|------|------|-------------------|
| commander | dependencies | CLI引数解析 | `^`(マイナーまで許可)。メジャー更新時はヘルプ出力をE2Eで確認 |
| simple-git | dependencies | Git操作 | `^`(マイナーまで許可) |
| string-width | dependencies | 表示幅計算 | `^`(マイナーまで許可) |
| picocolors | dependencies | 色付け | `^`(マイナーまで許可) |
| typescript | devDependencies | コンパイル | `~`(パッチのみ)。マイナー更新で型チェック結果が変わり得るため |
| その他の開発ツール | devDependencies | lint・テスト・整形 | `^`(既存設定を維持) |

**方針**:
- `package-lock.json` を必ずコミットし、再現可能なインストールを保証する
- dependencies の追加は、起動時間・インストールサイズへの影響を確認したうえで行う(追加の判断基準は [development-guidelines.md](./development-guidelines.md) で定義する)
- 依存ライブラリの更新は月1回まとめて行い、全テストとE2Eの通過を確認する
