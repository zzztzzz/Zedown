# Zedown — Markdown 速记 · 编辑 · 阅读 — Chrome 扩展

> **当前版本：`1.1.2`**（见 `extension/manifest.json`，Manifest V3）。版本号以 GitHub Releases 为准。

一个干净、专注的 Markdown 笔记浏览器扩展，由设计稿 `Markdown 插件 设计探索 1.1.0-a (打包).html` 还原实现。提供三个界面：

| 界面 | 入口 | 能力 |
| --- | --- | --- |
| **侧边栏速记** | 工具栏图标 / 快捷键 `Alt+Shift+M`（右侧开关，再按一次关闭） | 即时记录，编辑/预览切换，格式工具栏，本地自动保存 |
| **全屏编辑器** | 侧边栏右上角「⤢ 全屏」/ 快捷键 `Alt+Shift+E` | 文件树（文件夹、新建/导入/打开真实文件/重命名/删除）、搜索、编辑/分屏/阅读三种视图、主题切换、导出 |
| **只读阅读器** | 编辑器「阅读」视图 | 纯净渲染、自动目录、阅读进度条、字号调节、主题切换 |

三套视觉主题：**Paper**（暖调纸感）、**Midnight**（深色开发者）、**Indigo**（清爽 SaaS）。

## 功能（按版本）

### 1.1.0（首个发布）

- **三界面实时同步**：侧边栏速记 / 全屏编辑器 / 只读阅读器。
- **自带 Markdown 渲染器**：标题、列表（含任务列表/嵌套）、表格、代码块、引用、链接、图片、删除线等。
- **渲染增强**：代码块多语言**语法高亮**（js/ts/json/html/css/bash/python/http/md/sql）、**脚注** `[^1]`、代码块**「复制」**按钮、标题**悬停锚点**。
- **数学公式**：内置 KaTeX，行内 `$...$` 与独立 `$$...$$` 自动渲染（含字体，离线可用）。
- **图表**：内置 Mermaid，` ```mermaid ` 代码块渲染为流程图/时序图等；渲染失败自动降级显示源码。
- **数据与导出**：单篇导出 `.md` / `.html`（自包含）/ **打印·PDF**；**全部导出 `.zip`**（保留文件夹路径，纯 JS 打包）；**回收站**（软删除 + 恢复 + 清空）；文件树**拖拽排序**。
- **编辑体验**：斜杠 `/` **命令菜单**（插入标题/列表/待办/代码/表格/引用/分隔线）、**智能编辑**（回车续写列表、Tab 缩进、自动配对、`Cmd+K` 加链接）、**查找替换**（`Cmd+F` / `Cmd+H`）。
- **网页联动**：右键**选区 HTML→Markdown**（保留加粗/链接/标题等格式）；侧边栏**「剪藏整页」**——提取网页正文转 Markdown，存入「网页剪藏 / 域名」文件夹。
- **键盘快捷键系统**：12 个可重绑定快捷键，编辑器内 `⌘/` 或「⌨」按钮打开**重绑定面板**（点击改键，含冲突检测与「浏览器占用」提示，`localStorage` 持久化）；顶部**格式工具栏**；**可折叠文件栏**；**空状态**引导；内置「📖 Markdown 使用教程」。

### 1.1.1

- **全局快捷键**：`Alt+Shift+M` 开关侧边栏、`Alt+Shift+E` 打开全屏编辑器（可在 `chrome://extensions/shortcuts` 改键）。
- **自动渲染本地 .md**：把 `.md / .markdown` 拖进浏览器（`file://…`）即**自动用 Zedown 阅读视图渲染**（目录、进度、字号、主题）。
  - ⚠️ 需开启文件访问：`chrome://extensions` → Zedown →「详情」→ 打开 **「允许访问文件网址」**（扩展默认无文件访问权限）。
- **拖拽到 Zedown 页面阅读**：把 `.md/.markdown/.txt` 拖到 Zedown 的侧边栏 / 编辑器 / 阅读器页面，直接进入阅读模式；拖入为只读预览，「导入并编辑」可存为笔记再编辑。
- 阅读正文铺满全宽；阅读器目录可折叠（状态记忆）。
- **文件夹可删除**（连同内容移入回收站，可恢复）。
- **打开真实文件 / 文件夹**：基于 File System Access API 直接读写硬盘上的原始 `.md` 文件，编辑后**防抖自动写回**（每次会话首次写回需点一次授权）；文件夹递归读入 `.md/.markdown/.txt` 并保留目录结构，本地文件在树中带「⎙ 本地」标记。仅全屏编辑器标签页支持。
- 数据仅存本机（移除云端/备份）。

### 1.1.2

- **修复**：把本地 `.md` 拖进浏览器（阅读视图）时 **Mermaid 图表 / KaTeX 公式不渲染**（编辑器内正常）——content script 未注入 mermaid/katex 所致，现已补齐。
- **剪藏整页**改为通过 `host_permissions` + `executeScript` 直接抓取当前页正文，去掉后台中转；失败返回真实原因并校验页面 URL。

> 笔记保存在本机浏览器（`chrome.storage.local`），不联网、不上传。需要备份时用编辑器的「导出」（.md / .html / .zip）。

> 后续规划：网页划线批注（需 `<all_urls>` 全站脚本）、Vim 模式。

## 安装（开发者模式加载）

1. 打开 Chrome，访问 `chrome://extensions`
2. 右上角开启 **开发者模式 (Developer mode)**
3. 点击 **加载已解压的扩展程序 (Load unpacked)**
4. 选择本仓库的 **`extension/`** 目录
5. 固定工具栏图标后，点击即可打开侧边栏

> 需要 Chrome 114+（侧边栏 `sidePanel` API）。

### 快捷键

- 两个**全局快捷键**可在 `chrome://extensions/shortcuts` 自定义改键：
  - `Alt+Shift+M` —— 开关侧边栏速记（右侧弹出/收起）
  - `Alt+Shift+E` —— 打开全屏编辑器
- 编辑器**内部**的格式/操作快捷键（加粗、斜体、分屏切换、阅读等）在编辑器里按 `⌘/` / `Ctrl+/` 打开面板逐项重绑定。

## 功能要点

- **本地优先**：所有笔记、主题、草稿保存在 `chrome.storage.local`，三个界面实时同步。
- **零依赖运行**：纯原生 JS，符合 Manifest V3 内容安全策略，无需构建、无远程脚本。
- **字体内置**：JetBrains Mono / Public Sans / Spectral 以 woff2 形式打包，无外部字体请求。

## 目录结构

```
extension/
├── manifest.json          # MV3 清单（version = 打包版本号）
├── background.js          # service worker（侧边栏行为、右键菜单、快捷键、初始化）
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

## 设计来源

`design/` 保存了设计来源：1.1.0 的三个设计探索稿（打包 HTML，`设计探索 1.1.0-a/b/c`），以及 `design/design-src/`（解包出的原始 React 原型 `MDApp.jsx`、各 `comp_*.jsx`、`helper_*.js`）。生产扩展为其无框架、可直接加载的等价实现。
