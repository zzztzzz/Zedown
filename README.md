# Zedown — Markdown 速记 · 编辑 · 阅读 — Chrome 扩展

**[简体中文](#简体中文)** · **[English](#english)** · **[日本語](#日本語)**

> **当前版本 / Current version / 現在のバージョン：`1.1.2`**（见 `extension/manifest.json`，Manifest V3）

---

## 简体中文

> **当前版本：`1.1.2`**（见 `extension/manifest.json`，Manifest V3）。
> 下文的 **V1 / V2 / V2.1 / V3** 是**设计里程碑**名称（功能演进阶段），并非扩展的发布版本号；二者的对应关系见 [版本历史](#版本历史)。

一个干净、专注的 Markdown 笔记浏览器扩展，由设计稿 `Markdown 插件 设计探索 (打包).html` 还原实现。提供三个界面：

| 界面 | 入口 | 能力 |
| --- | --- | --- |
| **侧边栏速记** | 工具栏图标 / 快捷键 `Alt+Shift+M`（右侧开关，再按一次关闭） | 即时记录，编辑/预览切换，格式工具栏，本地自动保存 |
| **全屏编辑器** | 侧边栏右上角「⤢ 全屏」/ 快捷键 `Alt+Shift+E` | 文件树（文件夹、新建/导入/打开真实文件/重命名/删除）、搜索、编辑/分屏/阅读三种视图、主题切换、导出 |
| **只读阅读器** | 编辑器「阅读」视图 | 纯净渲染、自动目录、阅读进度条、字号调节、主题切换 |

三套视觉主题：**Paper**（暖调纸感）、**Midnight**（深色开发者）、**Indigo**（清爽 SaaS）。

### 功能演进（设计里程碑）

> 以下 V2 / V2.1 / V3 记录的是**功能阶段**，全部能力已包含在当前打包版本 `1.1.2` 中。

#### V2 新增

- **渲染增强**：代码块多语言**语法高亮**（js/ts/json/html/css/bash/python/http/md/sql）、**脚注** `[^1]`、代码块**「复制」**按钮、标题**悬停锚点**。
- **数据与导出**：单篇导出 `.md` / `.html`（自包含）/ **打印·PDF**；**全部导出 `.zip`**（保留文件夹路径，纯 JS 打包）；**回收站**（软删除 + 恢复 + 清空）；文件树**拖拽排序**。
- **编辑体验**：斜杠 `/` **命令菜单**（插入标题/列表/待办/代码/表格/引用/分隔线）、**智能编辑**（回车续写列表、Tab 缩进、自动配对、`Cmd+K` 加链接）、**查找替换**（`Cmd+F` / `Cmd+H`）。
- **网页联动**：右键**选区 HTML→Markdown**（保留加粗/链接/标题等格式）；侧边栏**「剪藏整页」**——提取网页正文转 Markdown，存入「网页剪藏 / 域名」文件夹。

#### V2.1 新增

- **数学公式**：内置 KaTeX，行内 `$...$` 与独立 `$$...$$` 自动渲染（含字体，离线可用）。
- **图表**：内置 Mermaid，` ```mermaid ` 代码块渲染为流程图/时序图等；渲染失败自动降级显示源码。

#### V3 新增（品牌升级为 Zedown）

- **键盘快捷键系统**：内置 12 个可重绑定的快捷键（加粗/斜体/代码/链接/标题/列表/待办/引用/保存/编辑分屏切换/阅读/快捷键设置），编辑器内 `⌘/` 或「⌨」按钮打开**重绑定面板**（点击按键即可改键，含冲突检测与「浏览器占用」提示，`localStorage` 持久化）。
- **格式工具栏**：编辑器顶部常驻 B / I / `</>` / 链接 ｜ 标题 / 列表 / 待办 / 引用，悬停显示实时快捷键。
- **可折叠文件栏**：编辑器侧栏可收起为窄条（`«` / `»`），状态记忆。
- **空状态**：无笔记时显示「还没有笔记」引导（新建 / 导入）。
- **可折叠目录**：阅读器 TOC 可收起，状态记忆。
- **教程示例**：内置「📖 Markdown 使用教程」，演示公式 `$E=mc^2$` / `$$…$$` 与 ```mermaid 图表。
- **品牌**：全面更名 **Zedown**（标识「Z」）。
- **自动渲染本地 .md（像 Markdown Reader）**：把 `.md / .markdown` 文件拖进浏览器（打开 `file://…`）即**自动用 Zedown 阅读视图渲染**（目录、进度、字号、主题）。
  - ⚠️ 需开启文件访问：`chrome://extensions` → Zedown →「详情」→ 打开 **「允许访问文件网址 / Allow access to file URLs」**（扩展默认无文件访问权限）。
- **拖拽到 Zedown 页面阅读**：也可把 `.md/.markdown/.txt` 拖到 Zedown 的侧边栏 / 编辑器 / 阅读器页面，直接进入阅读模式（编辑器/侧边栏会在新标签页用阅读器打开）。
- **打开真实文件 / 文件夹**：编辑器「+」菜单或空状态的「打开文件… / 打开文件夹…」直接读写硬盘上的**原始 `.md` 文件**（基于 File System Access API），编辑后**防抖自动写回原文件**（每次会话首次写回需点一次授权）。文件夹会递归读入 `.md/.markdown/.txt` 并保留目录结构；本地文件在树中带「⎙ 本地」标记。
  - 仅全屏编辑器标签页支持；侧边栏仍为本地速记。原有「导入 .md」（复制一份进扩展）保留不变。

> 笔记保存在本机浏览器（`chrome.storage.local`），不联网、不上传。需要备份时用编辑器的「导出」（.md / .html / .zip）。

> V2.2 规划：网页划线批注（需 `<all_urls>` 全站脚本）、Vim 模式。

### 安装（开发者模式加载）

1. 打开 Chrome，访问 `chrome://extensions`
2. 右上角开启 **开发者模式 (Developer mode)**
3. 点击 **加载已解压的扩展程序 (Load unpacked)**
4. 选择本仓库的 **`extension/`** 目录
5. 固定工具栏图标后，点击即可打开侧边栏

> 需要 Chrome 114+（侧边栏 `sidePanel` API）。

#### 快捷键

- 两个**全局快捷键**可在 `chrome://extensions/shortcuts` 自定义改键：
  - `Alt+Shift+M` —— 开关侧边栏速记（右侧弹出/收起）
  - `Alt+Shift+E` —— 打开全屏编辑器
- 编辑器**内部**的格式/操作快捷键（加粗、斜体、分屏切换、阅读等）在编辑器里按 `⌘/` / `Ctrl+/` 打开面板逐项重绑定。

### 功能要点

- **本地优先**：所有笔记、主题、草稿保存在 `chrome.storage.local`，三个界面实时同步。
- **零依赖运行**：纯原生 JS，符合 Manifest V3 内容安全策略，无需构建、无远程脚本。
- **自带 Markdown 渲染器**：支持标题、列表（含任务列表/嵌套）、表格、代码块（语言标签）、引用、链接、图片、删除线等。
- **右键采集**：在任意网页选中文本 → 右键「保存选中文本到 Markdown 速记」，自动追加到侧边栏草稿。
- **字体内置**：JetBrains Mono / Public Sans / Spectral 以 woff2 形式打包，无外部字体请求。

### 目录结构

```
extension/
├── manifest.json          # MV3 清单（version = 打包版本号）
├── background.js          # service worker（侧边栏行为、右键菜单、快捷键、初始化）
├── CONTRACT*.md           # 各界面的构建契约（V2 / V2.1 / V3）
├── lib/
│   ├── md.js              # Markdown → HTML 渲染器
│   ├── highlight.js       # 代码块语法高亮
│   ├── enhance.js         # 渲染增强（KaTeX 公式、Mermaid 图表、复制按钮、锚点等）
│   ├── themes.js          # 主题 token + prose 样式（自动注入）
│   ├── sample.js          # 首次运行的示例 / 教程内容
│   ├── store.js           # chrome.storage 持久化 + 文件树操作
│   ├── reader-view.js     # 可复用的阅读器视图工厂
│   ├── fsaccess.js        # File System Access API（打开/写回本地文件、文件夹）
│   ├── html2md.js         # 网页 HTML → Markdown（选区转换 / 剪藏）
│   ├── export.js          # 单篇导出 .md / .html / 打印·PDF
│   ├── zip.js             # 纯 JS .zip 打包（全部导出）
│   ├── shortcuts.js       # 可重绑定快捷键系统
│   └── vendor/            # 第三方资源：katex/（含字体 + CSS）、mermaid.min.js
├── content/
│   ├── mdview.js          # file://*.md 内容脚本：自动用阅读视图渲染本地 Markdown
│   └── extract.js         # 网页正文提取（剪藏整页）
├── sidepanel/             # 侧边栏界面
├── editor/                # 全屏编辑器界面
├── reader/                # 只读阅读器界面
├── fonts/                 # 打包字体 (woff2) + fonts.css
└── icons/                 # 16/32/48/128 图标
```

### 版本历史

> 实际发布版本号以 `extension/manifest.json` 的 `version` 为准。

| 版本 | 内容 | 对应里程碑 |
| --- | --- | --- |
| **1.1.2**（当前） | 侧边栏「剪藏整页」改为 `host_permissions` + `executeScript` 直接抓取；修复拖入浏览器的本地 `.md` 阅读视图未渲染 Mermaid 图表 / KaTeX 公式 | — |
| **1.1.1** | 全局「打开编辑器」快捷键改为 `Alt+Shift+M`（避开 Chrome 占用） | — |
| **1.1.0** | 首个 Zedown 打包版本，整合全部能力 | V1 + V2 + V2.1 + V3 |

### 设计来源

`design/` 保存了设计来源：V1/V2/V3 三个设计稿（打包 HTML），以及 `design/design-src/`（从 V1 解包出的原始 React 原型 `MDApp.jsx`、各 `comp_*.jsx`、`helper_*.js`）。生产扩展为其无框架、可直接加载的等价实现。

---

## English

> **Current version: `1.1.2`** (see `extension/manifest.json`, Manifest V3).
> The **V1 / V2 / V2.1 / V3** labels below are **design milestones** (feature phases), not the extension's release version numbers. See [Changelog](#changelog) for the mapping.

A clean, focused Markdown note-taking browser extension, reimplemented from the design mockup `Markdown 插件 设计探索 (打包).html`. It offers three surfaces:

| Surface | Entry | Capabilities |
| --- | --- | --- |
| **Side-panel quick notes** | Toolbar icon / shortcut `Alt+Shift+M` (toggle on the right; press again to close) | Instant capture, edit/preview toggle, formatting toolbar, local autosave |
| **Full-screen editor** | "⤢ Full screen" at the top-right of the side panel / shortcut `Alt+Shift+E` | File tree (folders, create/import/open real files/rename/delete), search, edit/split/read views, theme switching, export |
| **Read-only reader** | "Read" view in the editor | Clean rendering, auto table of contents, reading progress bar, font-size control, theme switching |

Three visual themes: **Paper** (warm paper tone), **Midnight** (dark developer), **Indigo** (crisp SaaS).

### Feature evolution (design milestones)

> The V2 / V2.1 / V3 entries below are **feature phases**; all of these capabilities are already included in the current packaged version `1.1.2`.

#### Added in V2

- **Rendering enhancements**: multi-language **syntax highlighting** for code blocks (js/ts/json/html/css/bash/python/http/md/sql), **footnotes** `[^1]`, a **"Copy"** button on code blocks, **hover anchors** on headings.
- **Data & export**: per-note export to `.md` / `.html` (self-contained) / **Print·PDF**; **export all as `.zip`** (preserves folder paths, pure-JS packaging); **recycle bin** (soft delete + restore + empty); **drag-and-drop reordering** of the file tree.
- **Editing experience**: slash `/` **command menu** (insert heading/list/todo/code/table/quote/divider), **smart editing** (continue lists on Enter, Tab indent, auto-pairing, `Cmd+K` to add a link), **find & replace** (`Cmd+F` / `Cmd+H`).
- **Web integration**: right-click **selection HTML→Markdown** (preserves bold/links/headings, etc.); side-panel **"Clip whole page"** — extracts the main article content to Markdown and stores it under a "Web Clips / domain" folder.

#### Added in V2.1

- **Math formulas**: built-in KaTeX; inline `$...$` and display `$$...$$` render automatically (fonts bundled, works offline).
- **Diagrams**: built-in Mermaid; ` ```mermaid ` code blocks render as flowcharts/sequence diagrams, etc.; on failure it gracefully falls back to showing the source.

#### Added in V3 (rebranded to Zedown)

- **Keyboard shortcut system**: 12 built-in, rebindable shortcuts (bold/italic/code/link/heading/list/todo/quote/save/toggle edit-split/read/shortcut settings); open the **rebinding panel** in the editor via `⌘/` or the "⌨" button (click a key to rebind, with conflict detection and a "taken by browser" hint, persisted to `localStorage`).
- **Formatting toolbar**: a persistent top bar in the editor — B / I / `</>` / link ｜ heading / list / todo / quote, with live shortcuts shown on hover.
- **Collapsible file bar**: the editor side bar can collapse to a thin strip (`«` / `»`), with remembered state.
- **Empty state**: a "No notes yet" guide (Create / Import) when there are no notes.
- **Collapsible TOC**: the reader's table of contents can collapse, with remembered state.
- **Tutorial sample**: a built-in "📖 Markdown tutorial" demonstrating formulas `$E=mc^2$` / `$$…$$` and ```mermaid diagrams.
- **Branding**: fully renamed to **Zedown** (the "Z" mark).
- **Auto-render local .md (like a Markdown Reader)**: drag a `.md / .markdown` file into the browser (opening `file://…`) and it is **automatically rendered with the Zedown reading view** (TOC, progress, font size, theme).
  - ⚠️ Requires file access: `chrome://extensions` → Zedown → "Details" → enable **"Allow access to file URLs"** (extensions have no file access by default).
- **Drag onto a Zedown page to read**: you can also drag `.md/.markdown/.txt` onto Zedown's side panel / editor / reader page to enter reading mode directly (the editor/side panel opens the reader in a new tab).
- **Open real files / folders**: via the editor's "+" menu or the empty state's "Open file… / Open folder…", read and write the **original `.md` files** on disk directly (via the File System Access API); after editing it **debounce-writes back to the original file** (the first write-back per session requires a one-time authorization). Folders are read recursively for `.md/.markdown/.txt` while preserving the directory structure; local files are marked "⎙ Local" in the tree.
  - Supported only in the full-screen editor tab; the side panel remains for local quick notes. The existing "Import .md" (copies a file into the extension) is unchanged.

> Notes are stored in your local browser (`chrome.storage.local`) — no network, no upload. To back up, use the editor's "Export" (.md / .html / .zip).

> V2.2 plans: web text highlighting/annotation (requires an `<all_urls>` site-wide script), Vim mode.

### Installation (load in developer mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** in the top-right
3. Click **Load unpacked**
4. Select this repository's **`extension/`** directory
5. Pin the toolbar icon, then click it to open the side panel

> Requires Chrome 114+ (the `sidePanel` API).

#### Shortcuts

- Two **global shortcuts**, customizable at `chrome://extensions/shortcuts`:
  - `Alt+Shift+M` — toggle the side-panel quick notes (slide in/out on the right)
  - `Alt+Shift+E` — open the full-screen editor
- The editor's **internal** formatting/action shortcuts (bold, italic, split toggle, read, etc.) can be rebound item-by-item via the panel opened with `⌘/` / `Ctrl+/` inside the editor.

### Highlights

- **Local-first**: all notes, themes, and drafts are stored in `chrome.storage.local` and sync in real time across the three surfaces.
- **Zero-dependency runtime**: pure vanilla JS, compliant with the Manifest V3 content security policy — no build step, no remote scripts.
- **Built-in Markdown renderer**: supports headings, lists (incl. task lists/nesting), tables, code blocks (with language labels), quotes, links, images, strikethrough, and more.
- **Right-click capture**: select text on any page → right-click "Save selected text to Markdown quick notes" to append it to the side-panel draft.
- **Bundled fonts**: JetBrains Mono / Public Sans / Spectral are packaged as woff2 — no external font requests.

### Directory structure

```
extension/
├── manifest.json          # MV3 manifest (version = packaged version number)
├── background.js          # service worker (side-panel behavior, context menus, shortcuts, init)
├── CONTRACT*.md           # build contracts for each surface (V2 / V2.1 / V3)
├── lib/
│   ├── md.js              # Markdown → HTML renderer
│   ├── highlight.js       # code-block syntax highlighting
│   ├── enhance.js         # rendering enhancements (KaTeX, Mermaid, copy button, anchors, etc.)
│   ├── themes.js          # theme tokens + prose styles (auto-injected)
│   ├── sample.js          # first-run sample / tutorial content
│   ├── store.js           # chrome.storage persistence + file-tree operations
│   ├── reader-view.js     # reusable reader view factory
│   ├── fsaccess.js        # File System Access API (open/write back local files, folders)
│   ├── html2md.js         # web HTML → Markdown (selection conversion / clipping)
│   ├── export.js          # per-note export to .md / .html / Print·PDF
│   ├── zip.js             # pure-JS .zip packaging (export all)
│   ├── shortcuts.js       # rebindable shortcut system
│   └── vendor/            # third-party assets: katex/ (with fonts + CSS), mermaid.min.js
├── content/
│   ├── mdview.js          # file://*.md content script: auto-renders local Markdown in the reading view
│   └── extract.js         # web article extraction (clip whole page)
├── sidepanel/             # side-panel surface
├── editor/                # full-screen editor surface
├── reader/                # read-only reader surface
├── fonts/                 # bundled fonts (woff2) + fonts.css
└── icons/                 # 16/32/48/128 icons
```

### Changelog

> The actual release version is whatever `version` says in `extension/manifest.json`.

| Version | Contents | Milestone |
| --- | --- | --- |
| **1.1.2** (current) | Side-panel "Clip whole page" now grabs content directly via `host_permissions` + `executeScript`; fixed Mermaid diagrams / KaTeX formulas not rendering in the reading view for local `.md` files dragged into the browser | — |
| **1.1.1** | Global "open editor" shortcut changed to `Alt+Shift+M` (to avoid a Chrome conflict) | — |
| **1.1.0** | First packaged Zedown release, integrating all capabilities | V1 + V2 + V2.1 + V3 |

### Design source

`design/` keeps the design sources: the three design mockups V1/V2/V3 (packaged HTML), plus `design/design-src/` (the original React prototype unpacked from V1 — `MDApp.jsx`, the various `comp_*.jsx`, `helper_*.js`). The production extension is their framework-free, directly loadable equivalent.

---

## 日本語

> **現在のバージョン：`1.1.2`**（`extension/manifest.json` 参照、Manifest V3）。
> 以下の **V1 / V2 / V2.1 / V3** は**設計マイルストーン**名（機能の発展段階）であり、拡張機能のリリースバージョン番号ではありません。対応関係は [変更履歴](#変更履歴) を参照してください。

クリーンで集中できる Markdown ノート用ブラウザ拡張です。設計モック `Markdown 插件 设计探索 (打包).html` から再実装しました。3 つの画面を提供します：

| 画面 | 入口 | 機能 |
| --- | --- | --- |
| **サイドパネル速記** | ツールバーアイコン / ショートカット `Alt+Shift+M`（右側にトグル、もう一度押すと閉じる） | 即時メモ、編集/プレビュー切替、書式ツールバー、ローカル自動保存 |
| **全画面エディタ** | サイドパネル右上の「⤢ 全画面」/ ショートカット `Alt+Shift+E` | ファイルツリー（フォルダ、新規/インポート/実ファイルを開く/リネーム/削除）、検索、編集/分割/閲覧の 3 ビュー、テーマ切替、エクスポート |
| **読み取り専用リーダー** | エディタの「閲覧」ビュー | クリーンなレンダリング、自動目次、読書進捗バー、文字サイズ調整、テーマ切替 |

3 つのビジュアルテーマ：**Paper**（暖色の紙質感）、**Midnight**（ダークな開発者向け）、**Indigo**（爽やかな SaaS 風）。

### 機能の発展（設計マイルストーン）

> 以下の V2 / V2.1 / V3 は**機能フェーズ**の記録です。これらの機能はすべて現在のパッケージ版 `1.1.2` に含まれています。

#### V2 で追加

- **レンダリング強化**：コードブロックの多言語**シンタックスハイライト**（js/ts/json/html/css/bash/python/http/md/sql）、**脚注** `[^1]`、コードブロックの**「コピー」**ボタン、見出しの**ホバーアンカー**。
- **データとエクスポート**：単一ノートを `.md` / `.html`（自己完結）/ **印刷·PDF** に書き出し；**全件 `.zip` エクスポート**（フォルダパスを保持、純 JS でパッケージ）；**ごみ箱**（ソフト削除 + 復元 + 全消去）；ファイルツリーの**ドラッグ並べ替え**。
- **編集体験**：スラッシュ `/` **コマンドメニュー**（見出し/リスト/ToDo/コード/表/引用/区切り線を挿入）、**スマート編集**（Enter でリスト継続、Tab インデント、自動ペア入力、`Cmd+K` でリンク付与）、**検索置換**（`Cmd+F` / `Cmd+H`）。
- **Web 連携**：右クリックで**選択範囲 HTML→Markdown**（太字/リンク/見出しなどの書式を保持）；サイドパネルの**「ページ全体をクリップ」**——Web 本文を抽出して Markdown 化し、「Web クリップ / ドメイン」フォルダに保存。

#### V2.1 で追加

- **数式**：KaTeX を内蔵。インライン `$...$` とディスプレイ `$$...$$` を自動レンダリング（フォント同梱、オフライン可）。
- **図表**：Mermaid を内蔵。` ```mermaid ` コードブロックをフローチャート/シーケンス図などに描画。失敗時はソース表示へ自動フォールバック。

#### V3 で追加（Zedown へブランド刷新）

- **キーボードショートカットシステム**：再割り当て可能な 12 個のショートカットを内蔵（太字/斜体/コード/リンク/見出し/リスト/ToDo/引用/保存/編集分割切替/閲覧/ショートカット設定）。エディタ内で `⌘/` または「⌨」ボタンから**再割り当てパネル**を開く（キーをクリックして変更、衝突検出と「ブラウザが占有」ヒント付き、`localStorage` に永続化）。
- **書式ツールバー**：エディタ上部に常駐 — B / I / `</>` / リンク ｜ 見出し / リスト / ToDo / 引用、ホバーでリアルタイムにショートカット表示。
- **折りたたみ可能なファイルバー**：エディタのサイドバーを細い帯に折りたためる（`«` / `»`）、状態を記憶。
- **空状態**：ノートが無いとき「まだノートがありません」ガイド（新規 / インポート）を表示。
- **折りたたみ可能な目次**：リーダーの TOC を折りたためる、状態を記憶。
- **チュートリアル例**：「📖 Markdown 使い方チュートリアル」を内蔵。数式 `$E=mc^2$` / `$$…$$` と ```mermaid 図表をデモ。
- **ブランド**：全面的に **Zedown** へ改名（「Z」マーク）。
- **ローカル .md の自動レンダリング（Markdown Reader のように）**：`.md / .markdown` ファイルをブラウザにドラッグ（`file://…` を開く）すると、**自動的に Zedown 閲覧ビューでレンダリング**（目次、進捗、文字サイズ、テーマ）。
  - ⚠️ ファイルアクセスの有効化が必要：`chrome://extensions` → Zedown →「詳細」→ **「ファイルの URL へのアクセスを許可する」** をオン（拡張機能は既定でファイルアクセス権を持ちません）。
- **Zedown ページにドラッグして閲覧**：`.md/.markdown/.txt` を Zedown のサイドパネル / エディタ / リーダーのページにドラッグして直接閲覧モードに入ることもできます（エディタ/サイドパネルは新しいタブでリーダーを開きます）。
- **実ファイル / フォルダを開く**：エディタの「+」メニューまたは空状態の「ファイルを開く… / フォルダを開く…」から、ディスク上の**元の `.md` ファイル**を直接読み書き（File System Access API）。編集後は**デバウンスで元ファイルへ自動書き戻し**（セッションごとの初回書き戻しは 1 度だけ承認が必要）。フォルダは `.md/.markdown/.txt` を再帰的に読み込み、ディレクトリ構造を保持。ローカルファイルはツリー上で「⎙ ローカル」と表示。
  - 全画面エディタのタブのみ対応。サイドパネルは引き続きローカル速記用。従来の「.md インポート」（拡張内へコピー）はそのまま維持。

> ノートはローカルのブラウザ（`chrome.storage.local`）に保存され、通信もアップロードもしません。バックアップにはエディタの「エクスポート」（.md / .html / .zip）を使ってください。

> V2.2 の計画：Web ハイライト注釈（`<all_urls>` の全サイトスクリプトが必要）、Vim モード。

### インストール（デベロッパーモードで読み込み）

1. Chrome を開き `chrome://extensions` にアクセス
2. 右上の **デベロッパーモード (Developer mode)** をオン
3. **パッケージ化されていない拡張機能を読み込む (Load unpacked)** をクリック
4. 本リポジトリの **`extension/`** ディレクトリを選択
5. ツールバーアイコンを固定し、クリックするとサイドパネルが開きます

> Chrome 114+ が必要（サイドパネル `sidePanel` API）。

#### ショートカット

- 2 つの**グローバルショートカット**は `chrome://extensions/shortcuts` でカスタマイズ可能：
  - `Alt+Shift+M` —— サイドパネル速記の開閉（右側に表示/収納）
  - `Alt+Shift+E` —— 全画面エディタを開く
- エディタ**内部**の書式/操作ショートカット（太字、斜体、分割切替、閲覧など）は、エディタ内で `⌘/` / `Ctrl+/` から開くパネルで項目ごとに再割り当てできます。

### ハイライト

- **ローカルファースト**：すべてのノート・テーマ・下書きを `chrome.storage.local` に保存し、3 画面でリアルタイム同期。
- **依存ゼロの実行**：純粋なバニラ JS。Manifest V3 のコンテンツセキュリティポリシーに準拠し、ビルド不要・リモートスクリプトなし。
- **内蔵 Markdown レンダラー**：見出し、リスト（タスクリスト/ネスト含む）、表、コードブロック（言語ラベル）、引用、リンク、画像、打ち消し線などに対応。
- **右クリック収集**：任意のページでテキストを選択 → 右クリック「選択テキストを Markdown 速記に保存」でサイドパネルの下書きに追記。
- **フォント内蔵**：JetBrains Mono / Public Sans / Spectral を woff2 として同梱、外部フォントリクエストなし。

### ディレクトリ構成

```
extension/
├── manifest.json          # MV3 マニフェスト（version = パッケージ版のバージョン番号）
├── background.js          # service worker（サイドパネル動作、コンテキストメニュー、ショートカット、初期化）
├── CONTRACT*.md           # 各画面のビルド契約（V2 / V2.1 / V3）
├── lib/
│   ├── md.js              # Markdown → HTML レンダラー
│   ├── highlight.js       # コードブロックのシンタックスハイライト
│   ├── enhance.js         # レンダリング強化（KaTeX 数式、Mermaid 図表、コピーボタン、アンカー等）
│   ├── themes.js          # テーマ token + prose スタイル（自動注入）
│   ├── sample.js          # 初回起動時のサンプル / チュートリアル内容
│   ├── store.js           # chrome.storage 永続化 + ファイルツリー操作
│   ├── reader-view.js     # 再利用可能なリーダービューファクトリ
│   ├── fsaccess.js        # File System Access API（ローカルファイル/フォルダの読み書き）
│   ├── html2md.js         # Web HTML → Markdown（選択範囲変換 / クリップ）
│   ├── export.js          # 単一ノートを .md / .html / 印刷·PDF へエクスポート
│   ├── zip.js             # 純 JS の .zip パッケージ（全件エクスポート）
│   ├── shortcuts.js       # 再割り当て可能なショートカットシステム
│   └── vendor/            # サードパーティ資産：katex/（フォント + CSS 含む）、mermaid.min.js
├── content/
│   ├── mdview.js          # file://*.md コンテンツスクリプト：ローカル Markdown を閲覧ビューで自動描画
│   └── extract.js         # Web 本文抽出（ページ全体クリップ）
├── sidepanel/             # サイドパネル画面
├── editor/                # 全画面エディタ画面
├── reader/                # 読み取り専用リーダー画面
├── fonts/                 # 同梱フォント (woff2) + fonts.css
└── icons/                 # 16/32/48/128 アイコン
```

### 変更履歴

> 実際のリリースバージョンは `extension/manifest.json` の `version` を正とします。

| バージョン | 内容 | マイルストーン |
| --- | --- | --- |
| **1.1.2**（現在） | サイドパネルの「ページ全体をクリップ」を `host_permissions` + `executeScript` で直接取得に変更；ブラウザにドラッグしたローカル `.md` の閲覧ビューで Mermaid 図表 / KaTeX 数式が描画されない不具合を修正 | — |
| **1.1.1** | グローバルの「エディタを開く」ショートカットを `Alt+Shift+M` に変更（Chrome との衝突回避） | — |
| **1.1.0** | 最初の Zedown パッケージ版、全機能を統合 | V1 + V2 + V2.1 + V3 |

### 設計の出典

`design/` に設計の出典を保存：V1/V2/V3 の 3 つの設計モック（パッケージ済み HTML）と、`design/design-src/`（V1 から展開した元の React プロトタイプ — `MDApp.jsx`、各 `comp_*.jsx`、`helper_*.js`）。本番拡張はそれらのフレームワーク非依存・そのまま読み込める等価実装です。
