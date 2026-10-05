# claude-code-book-chapter8

本リポジトリは技術評論社より発行されている[「実践Claude Code入門 - 現場で活用するためのAIコーディングの思考法」](https://www.amazon.co.jp/dp/4297153548)のサンプルコードを管理するGitHubリポジトリです。

リポジトリ内のコード・プロンプトに関する詳細な解説は、書籍をご覧ください。

書籍の内容に関するご質問、不備のご指摘については以下のリポジトリのイシューよりお願いいたします。

https://github.com/GenerativeAgents/claude-code-book

## 注意事項

本リポジトリの内容は読者からのフィードバックを受けて、より性能の良いプロンプトに変更されることがあります。差分は随時書籍に反映されますが、お手元の版との差分があることをご承知おきください。

## 使い方

### 1. リポジトリのクローン

```bash
git clone [このリポジトリ] claude-code-book-chapter8
cd claude-code-book-chapter8
```

### 2. Dev Container経由で開く

Visual Studio Codeで「Reopen in Container」を選択すると、自動的に次のように環境構築が行われます。

- Node.js LTS環境の構築
- npm installの実行
- Claude Codeの最新版インストール

※ Dev Containerを利用する際は、事前にDockerのインストールが必要です。

## サンプルアプリケーション: TaskCLI

本リポジトリには、スペック駆動開発で作成したサンプルアプリケーション **TaskCLI**(Gitと一体化した開発者向けタスク管理CLIツール)が含まれています。仕様は [docs/](docs/) を参照してください。

### インストール

Node.js 20 以降と Git 2.30 以降が必要です。

```bash
npm ci
npm run build
npm link        # task コマンドが使えるようになります
```

### 使い方

```bash
task add "ユーザー認証機能の実装"      # タスクを追加
task list                             # 一覧(--all でアーカイブ済みも表示)
task start 1                          # feature/task-1 ブランチを作成して作業開始
task done 1                           # 完了
task archive 1                        # 一覧から外す
task show 1                           # 詳細
task delete 1                         # 削除(確認あり。--force で確認なし)
task hook install                     # コミットメッセージに "Task: #<id>" を自動追記
task --help                           # すべてのコマンド
```

- タスクはリポジトリルートの `.task/tasks.json` に保存されます。Gitでコミットすればチームで共有できます
- Gitリポジトリ外でも、ブランチ連携以外の機能は利用できます
- `task hook install` で導入したフックは、`git commit -m` などメッセージを指定したコミットにトレーラーを追記します。エディタで空のメッセージから書き始める場合は、空メッセージによるコミット中止を妨げないよう追記しません

### 開発

```bash
npm test             # ユニット・統合テスト
npm run test:e2e     # ビルドして E2E テスト
npm run lint
npm run typecheck
```
