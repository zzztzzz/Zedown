/* sample.js — demo content shared by the side panel and full editor. */
(function () {
  const NOTE = `# 周会纪要 · 产品迭代

> 记录于 2026-06-14 · 参与人 4 名

本周聚焦 **Markdown 插件** 的两个核心场景:侧边栏速记与全屏编辑。

## 待办事项

- [x] 跑通侧边栏与网页的布局
- [x] 实时预览渲染管线
- [ ] 导出为 \`.md\` / PDF
- [ ] 同步到云端笔记

## 决策记录

1. 默认 **分屏** 模式,左写右看
2. 主题支持浅色 / 深色切换
3. 快捷键 \`Cmd + S\` 自动保存到本地

## 代码片段

\`\`\`js
function autosave(doc) {
  localStorage.setItem('md:draft', doc);
  return Date.now();
}
\`\`\`

## 数据一览

| 指标 | 上周 | 本周 |
| --- | ---: | ---: |
| 日活笔记 | 1,204 | 1,580 |
| 渲染耗时 | 42ms | 31ms |

---

延伸阅读:[Markdown 指南](https://www.markdownguide.org)`;

  const FILES = [
    { id: 'f1', name: '周会纪要 · 产品迭代', tag: '工作', updated: '2 分钟前', body: NOTE },
    { id: 'f2', name: '阅读笔记 — 系统化思考', tag: '读书', updated: '昨天', body: '# 系统化思考\n\n> 把复杂问题拆成相互作用的部分。\n\n- 反馈回路\n- 存量与流量\n- 杠杆点\n\n**关键洞察**:结构决定行为。\n' },
    { id: 'f3', name: '旅行清单 · 京都', tag: '生活', updated: '3 天前', body: '# 京都行程\n\n## Day 1\n\n- [ ] 伏见稻荷\n- [ ] 清水寺\n- [ ] 锦市场\n\n## 备忘\n\n带好 \`西瓜卡\`,现金少量即可。\n' },
    { id: 'f4', name: 'API 设计草稿', tag: '工作', updated: '上周', body: '# API 设计\n\n\`\`\`http\nPOST /v1/notes\n\`\`\`\n\n返回 **201 Created**。\n\n| 字段 | 类型 |\n| --- | --- |\n| id | string |\n| body | string |\n' },
  ];

  const ARTICLE = `# Markdown 排版指南

> 一份用来演示**只读阅读模式**的长文 —— 标题、列表、代码、表格、引用一应俱全。

Markdown 是一种轻量级标记语言,目标是让人**先把内容写顺**,再交给渲染器变成漂亮的排版。本文带你快速过一遍常用语法在阅读视图里的样子。

## 为什么选择 Markdown

- 纯文本,任何编辑器都能打开,**永不过时**
- 语法极简,十分钟即可上手
- 天然适合版本管理与协作
- 一次书写,导出 HTML / PDF / 幻灯片皆可

> “能用纯文本解决的事,就别引入复杂格式。” —— 一条朴素的工程信条

## 文本与强调

正文里可以混用 **加粗**、*斜体*、~~删除线~~ 以及 \`行内代码\`。链接写作 [Markdown 指南](https://www.markdownguide.org),渲染后可点击跳转。

## 结构化清单

### 待办清单

- [x] 起草大纲
- [x] 补充示例
- [ ] 校对与配图
- [ ] 发布

### 有序步骤

1. 写下你的想法,不必在意格式
2. 用 \`#\` 标出层级
3. 切换到阅读模式检查排版
4. 导出分享

## 代码块

阅读模式下代码块带语言标签,等宽对齐,适合贴片段:

\`\`\`js
// 把 Markdown 渲染成 HTML
function render(src) {
  return mdToHtml(src);
}
\`\`\`

## 表格对比

| 场景 | 推荐模式 | 说明 |
| --- | --- | --- |
| 随手记 | 侧边栏 | 不打断浏览 |
| 长文写作 | 分屏编辑 | 左写右看 |
| 安静阅读 | 只读渲染 | 专注内容 |

## 小结

把注意力放在内容本身,排版交给渲染器。这正是 **mdReader** 想做的事:一个干净、专注、纯粹用来读的视图。

---

延伸阅读:[CommonMark 规范](https://commonmark.org) · [GitHub Flavored Markdown](https://github.github.com/gfm/)`;

  const TUTORIAL = `# Markdown 使用教程

> 三分钟掌握日常写作需要的全部语法。左边输入,右边即时预览 —— 边看边学最快。

Markdown 用**简单的符号**来标记格式:你只管写字,渲染器负责排版。下面按使用频率从高到低过一遍。

## 一、标题

用 \`#\` 开头,几个井号就是几级标题:

\`\`\`md
# 一级标题
## 二级标题
### 三级标题
\`\`\`

## 二、强调

| 写法 | 效果 |
| --- | --- |
| \`**加粗**\` | **加粗** |
| \`*斜体*\` | *斜体* |
| \`~~删除线~~\` | ~~删除线~~ |

用一对反引号包住文字,就得到 \`行内代码\` 的效果。

## 三、列表

无序列表用 \`-\`,有序列表用 \`1.\`,缩进两个空格即可嵌套:

- 第一项
- 第二项
  - 子项 A
  - 子项 B
1. 第一步
2. 第二步

### 待办清单

在列表项前加 \`[ ]\` 或 \`[x]\`:

- [x] 已完成的事
- [ ] 还没做的事

## 四、引用与分割线

\`>\` 开头是引用,三个 \`-\` 单独成行是分割线:

> 引用别人的话,或强调一段提示。

---

## 五、代码块

用三个反引号包裹,可以标注语言来高亮:

\`\`\`js
function hello(name) {
  return 'Hi, ' + name;
}
\`\`\`

## 六、链接与图片

\`\`\`md
[显示文字](https://example.com)
![图片说明](图片地址.png)
\`\`\`

链接示例:[Markdown 官方指南](https://www.markdownguide.org)

## 七、表格

用 \`|\` 分隔单元格,第二行用 \`---\` 定义表头,\`:\` 控制对齐:

| 左对齐 | 居中 | 右对齐 |
| :--- | :---: | ---: |
| a | b | c |
| 长一点的内容 | 中 | 1,280 |

## 八、数学公式与图表

需要时才加载渲染器(懒加载),不用的人零负担。行内公式写成 $E = mc^2$,块级公式用 \`$\`:

$\\int_0^1 x^2 \\, dx = \\frac{1}{3}$

流程图用 \`\`\`mermaid 代码块:

\`\`\`mermaid
flowchart LR
  A[写笔记] --> B{渲染}
  B -->|公式| C[KaTeX]
  B -->|图表| D[Mermaid]
\`\`\`

---

### 小贴士

1. 写作时用**分屏**模式,左写右看最直观
2. 选中文字按 \`⌘B\` / \`⌘I\` 快速加粗、斜体
3. 写完切到**阅读**模式,享受干净的全屏排版

> 把符号记进肌肉记忆后,你会发现纯文本写作又快又舒服。开始写吧!`;

  const TREE = [
    { id: 'f0', type: 'file', name: '📖 Markdown 使用教程.md', tag: '教程', updated: '刚刚', body: TUTORIAL },
    { id: 'd-work', type: 'folder', name: '工作', open: true, children: [
      { id: 'f1', type: 'file', name: '周会纪要 · 产品迭代', tag: '工作', updated: '2 分钟前', body: NOTE },
      { id: 'f4', type: 'file', name: 'API 设计草稿', tag: '工作', updated: '上周', body: FILES[3].body },
    ] },
    { id: 'd-life', type: 'folder', name: '个人', open: true, children: [
      { id: 'f2', type: 'file', name: '阅读笔记 — 系统化思考', tag: '读书', updated: '昨天', body: FILES[1].body },
      { id: 'f3', type: 'file', name: '旅行清单 · 京都', tag: '生活', updated: '3 天前', body: FILES[2].body },
    ] },
    { id: 'fa', type: 'file', name: '排版指南.md', tag: '示例', updated: '上周', body: ARTICLE },
  ];

  window.MD_SAMPLE = { NOTE, FILES, ARTICLE, TUTORIAL, TREE };
})();
