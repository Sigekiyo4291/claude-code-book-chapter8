# リポジトリ構造定義書 (Repository Structure Document)

本書は [技術仕様書](./architecture.md) で定義したレイヤードアーキテクチャと、[機能設計書](./functional-design.md) のコンポーネントを、具体的なディレクトリ・ファイル配置に落とし込む。

## プロジェクト構造

```
claude-code-book-chapter8/
├── src/                           # ソースコード(tsc で dist/ にコンパイル)
│   ├── cli/                       # CLIレイヤー
│   │   ├── index.ts               # エントリポイント(package.json の bin)
│   │   ├── program.ts             # Commander の program 組み立て
│   │   ├── context.ts             # コンポジションルート(依存の組み立て)
│   │   ├── commands/              # サブコマンドごとの定義
│   │   ├── presenters/            # 出力整形
│   │   └── io/                    # 標準入出力・プロンプトの抽象
│   ├── services/                  # サービスレイヤー
│   ├── repositories/              # データレイヤー(tasks.json)
│   ├── infra/                     # インフラレイヤー(Git・ファイルシステム)
│   └── domain/                    # ドメイン型・エラー(依存なし)
├── tests/                         # テストコード
│   ├── unit/                      # ユニットテスト(src/ と同じ構造)
│   ├── integration/               # 統合テスト(実Gitを使用)
│   ├── e2e/                       # E2Eテスト(ビルド済みCLIを実行)
│   └── helpers/                   # テスト用のヘルパー・テストダブル
├── docs/                          # 永続ドキュメント
│   └── ideas/                     # 壁打ち・アイデアメモ
├── .steering/                     # 作業単位のドキュメント(Git管理外)
├── .claude/                       # Claude Code 設定
├── .devcontainer/                 # 開発コンテナ設定
├── .husky/                        # Gitフック(lint-staged)
├── .github/workflows/             # CI 設定
├── dist/                          # ビルド成果物(Git管理外)
├── coverage/                      # カバレッジレポート(Git管理外)
├── package.json
├── package-lock.json
├── tsconfig.json                  # ビルド用(src/ のみ)
├── tsconfig.test.json             # 型チェック用(src/ + tests/)
├── vitest.config.ts               # 共通設定(カバレッジ閾値)
├── vitest.workspace.ts            # テストプロジェクト(core: unit + integration / e2e)
├── eslint.config.js
├── .prettierrc
├── CLAUDE.md
└── README.md
```

**注記**: 既存の `src/example.ts` / `src/example.test.ts` はテンプレートのサンプルであり、最初の機能実装時に削除する。

## ディレクトリ詳細

### src/ (ソースコードディレクトリ)

#### src/cli/

**役割**: CLIレイヤー。引数の解析、サービスの呼び出し、結果の表示、エラーから終了コードへの変換を担う

**配置ファイル**:
- `index.ts`: エントリポイント。先頭にシバン `#!/usr/bin/env node` を持つ。`program.ts` を呼び出し、最上位の例外処理と `process.exitCode` の設定のみを行う
- `program.ts`: Commander の `program` を生成し、全コマンドを登録する。ヘルプ・不明コマンド時のメッセージ(日本語化)を設定する
- `context.ts`: コンポジションルート。Workspace を解決し、リポジトリ・GitClient・サービスを生成して `CommandContext` を返す。**依存の組み立ては、このファイルでのみ行う**
- `commandDependencies.ts`: 各コマンドが受け取る依存(`output`・`prompt`・`createContext`)の型
- `errorHandler.ts`: `TaskCliError` を `✗ message` / `hint` 形式で表示し、予期しない例外を処理する
- `parseTaskId.ts`: ID引数(`1` / `#1`)を正の整数に変換する
- `parseStatusFilter.ts`: `--status` の値(`open,in_progress`)をステータスの配列に変換する
- `renderTaskListResult.ts`: `task list` / `task search` の結果(一覧表または0件メッセージ)を出力する

**依存関係**:
- 依存可能: `services/`、`domain/`、`infra/`・`repositories/`(**`context.ts` からのみ**)
- 依存禁止: `context.ts` 以外からの `repositories/`・`infra/` の import

#### src/cli/commands/

**役割**: サブコマンド1つにつき1ファイルで、引数・オプション定義とサービス呼び出しを記述する

**配置ファイル**:
- `[コマンド名]Command.ts`: `register[コマンド名]Command(program, createContext)` 関数を1つ export する

**命名規則**:
- ファイル名: camelCase + `Command` 接尾辞(関数を export するため)
- `task hook install` のようなネストしたコマンドは親コマンド単位で1ファイルにまとめる(`hookCommand.ts`)

**例**:
```
src/cli/commands/
├── initCommand.ts
├── addCommand.ts
├── listCommand.ts
├── searchCommand.ts
├── showCommand.ts
├── startCommand.ts
├── doneCommand.ts
├── archiveCommand.ts
├── deleteCommand.ts
└── hookCommand.ts          # install / uninstall / run
```

#### src/cli/presenters/

**役割**: サービスから返された値を、端末に表示する文字列に変換する(副作用なし)

**配置ファイル**:
- `TablePresenter.ts`: タスク一覧・詳細の整形
- `MessageFormatter.ts`: 成功・警告・エラーメッセージの整形(`✓` `⚠` `✗` と色付け)
- `sanitizeForTerminal.ts`: 制御文字の除去

**命名規則**: クラスは PascalCase + `Presenter` / `Formatter` 接尾辞

#### src/cli/io/

**役割**: 標準入出力・TTY判定・確認プロンプトを抽象化し、テストで差し替え可能にする

**配置ファイル**:
- `Output.ts`: `stdout` / `stderr` への書き込みと、色付け可否(TTY・`NO_COLOR`)の判定
- `ConfirmPrompt.ts`: `node:readline/promises` による `y/N` 確認

#### src/services/

**役割**: サービスレイヤー。ユースケースとビジネスルールを実装する

**配置ファイル**:
- `TaskService.ts`: タスクのCRUD・一覧の絞り込み・検索・開始・完了・アーカイブ
- `matchKeywords.ts`: 検索キーワードの正規化と一致判定を行う純粋関数
- `StatusTransitionPolicy.ts`: ステータス遷移表
- `BranchNameGenerator.ts`: ブランチ名の生成・検証
- `CommitHookService.ts`: フックの導入・削除、コミットメッセージへのトレーラー追記
- `appendTrailer.ts`: コミットメッセージにタスクトレーラーを追記する純粋関数
- `Clock.ts`: 現在時刻の抽象(`Clock` インターフェースと `systemClock`)
- `ports.ts`: サービスが依存するインターフェース(`TaskRepositoryPort`・`GitPort`・`TextFilePort`)

**命名規則**: PascalCase + 役割接尾辞(`Service` / `Policy` / `Generator`)

**依存関係**:
- 依存可能: `domain/`
- 依存禁止: `cli/`、`repositories/`、`infra/`、`node:fs`、`node:child_process`、`process` の入出力

**依存性逆転**: サービスは `repositories/`・`infra/` の具象クラスを import せず、`ports.ts` のインターフェースに依存する。具象クラスは `cli/context.ts` で注入する。これによりレイヤー間の依存方向(CLI → サービス → データ)を、import の方向でも保つ。

**例**:
```
src/services/
├── TaskService.ts
├── StatusTransitionPolicy.ts
├── BranchNameGenerator.ts
├── CommitHookService.ts
├── appendTrailer.ts
├── matchKeywords.ts
├── Clock.ts
└── ports.ts
```

#### src/repositories/

**役割**: データレイヤー。TaskStore の読み込み・保存、スキーマ検証・マイグレーションを担う

**配置ファイル**:
- `TaskRepository.ts`: `TaskRepositoryPort` の実装
- `taskStoreSchema.ts`: TaskStore の型ガード(`isTaskStore` 等)
- `migrations.ts`: `schemaVersion` ごとのマイグレーション関数

**依存関係**:
- 依存可能: `domain/`、`infra/`、`services/ports.ts`(インターフェースの実装のため型のみ)
- 依存禁止: `cli/`、`services/` のポート以外

#### src/infra/

**役割**: インフラレイヤー。外部プロセス・ファイルシステムとの境界

**配置ファイル**:
- `JsonFileStorage.ts`: アトミック書き込み・バックアップ・JSON読み込み
- `GitClient.ts`: simple-git のラッパー。`GitPort` の実装
- `WorkspaceResolver.ts`: `.task/` の配置ディレクトリの決定
- `TextFileSystem.ts`: テキストファイル(フックスクリプト・コミットメッセージ・`.task/` の補助ファイル)の読み書きと実行権限付与。`TextFilePort` の実装

**依存関係**:
- 依存可能: `domain/`、`services/ports.ts`(型のみ)、外部ライブラリ、Node.js 標準モジュール
- 依存禁止: `cli/`、`services/` のポート以外、`repositories/`

#### src/domain/

**役割**: すべてのレイヤーが共有するドメインの型とエラー。外部に一切依存しない

**配置ファイル**:
- `Task.ts`: `Task`・`TaskStatus`・`TaskStore`・`Workspace` の型と定数(`TASK_STATUSES`、`TITLE_MAX_LENGTH` 等)
- `errors.ts`: `TaskCliError` と派生エラークラス

**依存関係**:
- 依存可能: なし
- 依存禁止: 他のすべての `src/` ディレクトリ、外部ライブラリ、Node.js 標準モジュール

### tests/ (テストディレクトリ)

#### tests/unit/

**役割**: ユニットテスト。外部プロセス(Git)を起動しない

**構造**:
```
tests/unit/
├── cli/
│   ├── parseTaskId.test.ts
│   ├── parseStatusFilter.test.ts
│   └── presenters/
│       └── TablePresenter.test.ts
├── services/
│   ├── TaskService.test.ts
│   ├── StatusTransitionPolicy.test.ts
│   ├── BranchNameGenerator.test.ts
│   ├── matchKeywords.test.ts
│   └── CommitHookService.test.ts
├── repositories/
│   └── TaskRepository.test.ts
└── infra/
    └── JsonFileStorage.test.ts      # 一時ディレクトリの実ファイルを使用
```

**命名規則**:
- パターン: `[テスト対象ファイル名].test.ts`
- `src/` と同じ相対パスに配置する(`src/services/TaskService.ts` → `tests/unit/services/TaskService.test.ts`)

#### tests/integration/

**役割**: 統合テスト。一時ディレクトリに実際のGitリポジトリを作成し、サービス以下のレイヤーを結合して検証する

**構造**:
```
tests/integration/
├── task-branch/
│   ├── start-creates-branch.test.ts
│   └── start-checkout-failure.test.ts
├── commit-hook/
│   └── trailer-on-commit.test.ts
└── workspace/
    ├── resolve-from-subdirectory.test.ts
    └── outside-git-repository.test.ts
```

**命名規則**: 機能単位のディレクトリ(kebab-case)+ シナリオ名(kebab-case)`.test.ts`

#### tests/e2e/

**役割**: E2Eテスト。ビルド済みの `dist/cli/index.js` を子プロセスで実行し、出力と終了コードを検証する

**構造**:
```
tests/e2e/
├── basic-workflow.test.ts           # init → add → list → start → commit → done → archive
├── error-messages.test.ts           # 不正入力・不明コマンド・破損データ
├── delete-confirmation.test.ts      # 確認プロンプト
├── output-format.test.ts            # 非TTY・NO_COLOR
└── performance.test.ts              # 1,000件での list
```

**命名規則**: ユーザーシナリオ名(kebab-case)`.test.ts`

**前提**: E2Eテストの実行前に `npm run build` が必要。`npm run test:e2e` がビルドと実行をまとめて行う

#### tests/helpers/

**役割**: 複数のテストで共有するヘルパー

**配置ファイル**:
- `tempGitRepo.ts`: 一時ディレクトリへの `git init` とテスト用ユーザー設定、後片付け
- `runCli.ts`: E2E用に CLI を子プロセスで実行し `{ stdout, stderr, exitCode }` を返す
- `fakes.ts`: `GitPort`・`TaskRepositoryPort` のインメモリ実装、固定時刻の `Clock`
- `taskFactory.ts`: テスト用 Task の生成

### docs/ (ドキュメントディレクトリ)

**配置ドキュメント**:
- `product-requirements.md`: プロダクト要求定義書
- `functional-design.md`: 機能設計書
- `architecture.md`: 技術仕様書
- `repository-structure.md`: リポジトリ構造定義書(本ドキュメント)
- `development-guidelines.md`: 開発ガイドライン
- `glossary.md`: 用語集
- `ideas/`: 壁打ち・技術調査メモ(自由形式。正式な仕様ではない)

### .github/workflows/ (CI設定)

**配置ファイル**:
- `ci.yml`: lint → typecheck → test:coverage → build → test:e2e を OS × Node.js のマトリクスで実行

### config/・scripts/ について

MVPでは作成しない。
- 設定値(タイトル最大長、ブランチ接頭辞等)は `src/domain/Task.ts` の定数として定義する
- ビルド・テストの手順は `package.json` の `scripts` で完結させる

## ファイル配置規則

### ソースファイル

| ファイル種別 | 配置先 | 命名規則 | 例 |
|------------|--------|---------|-----|
| エントリポイント | `src/cli/` | `index.ts` | `index.ts` |
| コマンド定義 | `src/cli/commands/` | camelCase + `Command.ts` | `startCommand.ts` |
| 出力整形クラス | `src/cli/presenters/` | PascalCase + `Presenter` / `Formatter` | `TablePresenter.ts` |
| サービスクラス | `src/services/` | PascalCase + `Service` | `TaskService.ts` |
| ルール・生成クラス | `src/services/` | PascalCase + `Policy` / `Generator` | `StatusTransitionPolicy.ts` |
| ポート(インターフェース) | `src/services/` | `ports.ts` に集約 | `ports.ts` |
| リポジトリクラス | `src/repositories/` | PascalCase + `Repository` | `TaskRepository.ts` |
| インフラクラス | `src/infra/` | PascalCase + 役割名 | `GitClient.ts`, `JsonFileStorage.ts` |
| ドメイン型 | `src/domain/` | PascalCase(エンティティ名) | `Task.ts` |
| エラー定義 | `src/domain/` | `errors.ts` | `errors.ts` |
| 関数のみのファイル | 使用するレイヤー | camelCase + 動詞始まり | `parseTaskId.ts`, `sanitizeForTerminal.ts` |

### テストファイル

| テスト種別 | 配置先 | 命名規則 | 例 |
|-----------|--------|---------|-----|
| ユニットテスト | `tests/unit/`(src と同じ相対パス) | `[対象].test.ts` | `TaskService.test.ts` |
| 統合テスト | `tests/integration/[機能]/` | `[シナリオ].test.ts` | `start-creates-branch.test.ts` |
| E2Eテスト | `tests/e2e/` | `[シナリオ].test.ts` | `basic-workflow.test.ts` |
| テストヘルパー | `tests/helpers/` | camelCase | `tempGitRepo.ts` |

テストファイルは `src/` に置かない(`tsc` のビルド対象から確実に除外するため)。

### 設定ファイル

| ファイル種別 | 配置先 | 命名規則 |
|------------|--------|---------|
| ツール設定 | プロジェクトルート | `[ツール名].config.{ts,js}` |
| TypeScript(ビルド) | プロジェクトルート | `tsconfig.json`(`include: ["src"]`) |
| TypeScript(型チェック) | プロジェクトルート | `tsconfig.test.json`(`tsconfig.json` を継承し `tests` を追加、`noEmit: true`) |
| 定数 | `src/domain/Task.ts` | UPPER_SNAKE_CASE の `export const` |

### ユーザーのリポジトリに作成されるファイル

TaskCLIが**利用者のリポジトリ**に作成するファイル(本リポジトリのファイルではない):

```
<利用者のリポジトリルート>/
└── .task/
    ├── tasks.json          # タスクデータ
    ├── tasks.json.bak      # バックアップ
    ├── .gitignore          # tasks.json.bak と *.tmp を除外
    └── .gitattributes      # tasks.json text eol=lf
<git hooks dir>/
└── prepare-commit-msg      # task hook install で作成
```

本リポジトリで開発中に `task` を試用すると `.task/` が作成されるため、本リポジトリの `.gitignore` に `.task/` を追加する。

## 命名規則

### ディレクトリ名

- **レイヤーディレクトリ**: 複数形、kebab-case
  - 例: `services/`, `repositories/`, `commands/`, `presenters/`
- **例外**: `cli/`・`infra/`・`domain/`・`io/` は単一の概念を表すため単数形・略語とする
- **テストの機能ディレクトリ**: kebab-case
  - 例: `task-branch/`, `commit-hook/`

### ファイル名

- **クラスを export するファイル**: PascalCase(クラス名と一致)
  - 例: `TaskService.ts`, `GitClient.ts`
- **関数を export するファイル**: camelCase(主たる関数名と一致)
  - 例: `parseTaskId.ts`, `startCommand.ts`
- **型・定数を集約するファイル**: PascalCase(エンティティ名)または camelCase(集約名)
  - 例: `Task.ts`, `errors.ts`, `ports.ts`
- **1ファイル1責務**: 1ファイルが export する主要なクラス・関数は1つとする(型や定数の補助的な export は可)

### import の記法

- 相対パスで記述し、拡張子 `.js` を付ける(`moduleResolution: NodeNext` の要求)
  - 例: `import { TaskService } from '../services/TaskService.js';`
- 型のみの import には `import type` を使う
- パスエイリアス(`@/` 等)は使用しない(`tsc` 出力の実行時解決に追加設定が必要になるため)

## 依存関係のルール

### レイヤー間の依存

```
                 cli/
                  │
        ┌─────────┼──────────┐ (context.ts のみ)
        ↓         ↓          ↓
    services/  repositories/ infra/
        │         │    │      │
        │         │    └──→───┤
        │    ports.ts(型) ←───┘
        ↓         ↓          ↓
              domain/
```

| 依存元 \ 依存先 | cli | services | repositories | infra | domain |
|---|---|---|---|---|---|
| cli | - | ✅ | ⚠ context.ts のみ | ⚠ context.ts のみ | ✅ |
| services | ❌ | - | ❌ | ❌ | ✅ |
| repositories | ❌ | ⚠ ports.ts の型のみ | - | ✅ | ✅ |
| infra | ❌ | ⚠ ports.ts の型のみ | ❌ | - | ✅ |
| domain | ❌ | ❌ | ❌ | ❌ | - |

これらのルールは ESLint の `no-restricted-imports`(ディレクトリごとの `overrides`)で強制する。

### モジュール間の依存

- **循環依存の禁止**: 同一レイヤー内でも循環 import を禁止する。共通の型が必要な場合は `domain/` または `services/ports.ts` に抽出する
- **外部ライブラリの局所化**: 外部ライブラリは特定のファイルでのみ import する

| ライブラリ | import してよいファイル |
|-----------|----------------------|
| commander | `src/cli/program.ts`, `src/cli/commands/*` |
| simple-git | `src/infra/GitClient.ts` |
| string-width | `src/cli/presenters/TablePresenter.ts` |
| picocolors | `src/cli/presenters/MessageFormatter.ts`, `src/cli/presenters/TablePresenter.ts` |

ライブラリを差し替える際の影響範囲を、これらのファイルに限定するためである。

## スケーリング戦略

### 機能の追加

| 規模 | 配置方針 | 例 |
|------|---------|-----|
| 小規模(コマンド1つ追加) | 既存ディレクトリにファイルを追加 | `task search` → `src/cli/commands/searchCommand.ts` + `TaskService.searchTasks()` |
| 中規模(新しい外部連携) | `infra/` にサブディレクトリを作成 | GitHub連携 → `src/infra/github/GitHubClient.ts` + `src/services/GitHubSyncService.ts` |
| 大規模(独立した機能群) | `services/` 内に機能単位のサブディレクトリを作成 | チーム機能 → `src/services/team/` |

### P1機能の想定配置

タスクの絞り込み・検索(`searchCommand.ts` + `TaskService.searchTasks()`)は実装済み。並び替え(`--sort`)などで条件が増え TaskService が肥大化した場合は、一覧取得の処理を `TaskQueryService` に分離する。

```
src/
├── cli/commands/
│   ├── importCommand.ts           # GitHub Issues のインポート
│   └── syncCommand.ts             # GitHub 同期
├── services/
│   ├── TaskQueryService.ts        # 絞り込み・並び替え・検索(肥大化した場合に分離)
│   └── GitHubSyncService.ts
└── infra/
    └── github/
        ├── GitHubClient.ts
        └── tokenProvider.ts       # GITHUB_TOKEN / gh auth token
```

### ファイルサイズの管理

- 1ファイル: 300行以下を推奨
- 300〜500行: 責務の分割を検討する
- 500行以上: 分割する(例: `TaskService` が肥大化した場合、参照系を `TaskQueryService` に分離)
- `services/` 内のファイルが10個を超えた場合は、機能単位のサブディレクトリへの分割を検討する

## 特殊ディレクトリ

### .steering/ (ステアリングファイル)

**役割**: 特定の開発作業における「今回何をするか」を定義する

**構造**:
```
.steering/
└── [YYYYMMDD]-[task-name]/
    ├── requirements.md      # 今回の作業の要求内容
    ├── design.md            # 変更内容の設計
    └── tasklist.md          # タスクリスト
```

**命名規則**: `20261003-add-task-commands` 形式(日付 + kebab-case の作業名)

**Git管理**: `.gitignore` により `.gitkeep` 以外は管理外

### .claude/ (Claude Code設定)

**役割**: Claude Code の設定とカスタマイズ

**構造**:
```
.claude/
├── settings.json            # 共有設定(settings.local.json は Git管理外)
├── commands/                # スラッシュコマンド(setup-project, add-feature, review-docs)
├── skills/                  # ドキュメント作成・ステアリング用スキル
└── agents/                  # サブエージェント定義(doc-reviewer, implementation-validator)
```

### .husky/ (Gitフック)

**役割**: 本リポジトリの開発用フック。`pre-commit` で lint-staged を実行する

TaskCLIが利用者のリポジトリに導入する `prepare-commit-msg` フックとは無関係である。

## 除外設定

### .gitignore

既存の設定に加え、以下を追加する:
- `.task/`(開発中の試用で作成されるタスクデータ)

既存の主な除外対象:
- `node_modules/`, `dist/`, `coverage/`
- `.env`, `.env.*.local`
- `.steering/*`(`.gitkeep` を除く)
- `*.log`, `.DS_Store`, `.vscode/`, `.idea/`
- `.claude/settings.local.json`

### .prettierignore / ESLint の ignores

- `dist/`
- `node_modules/`
- `coverage/`
- `.steering/`

### npm パッケージの公開対象

`package.json` の `files` フィールドで公開対象を限定する:
```json
{
  "files": ["dist", "README.md", "LICENSE"]
}
```
`src/`・`tests/`・`docs/`・`.claude/` は公開パッケージに含めない。
