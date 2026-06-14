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

  const TREE = [
    { id: 'd-work', type: 'folder', name: '工作', open: true, children: [
      { id: 'f1', type: 'file', name: '周会纪要 · 产品迭代', tag: '工作', updated: '2 分钟前', body: NOTE },
      { id: 'f4', type: 'file', name: 'API 设计草稿', tag: '工作', updated: '上周', body: FILES[3].body },
    ] },
    { id: 'd-life', type: 'folder', name: '个人', open: true, children: [
      { id: 'f2', type: 'file', name: '阅读笔记 — 系统化思考', tag: '读书', updated: '昨天', body: FILES[1].body },
      { id: 'f3', type: 'file', name: '旅行清单 · 京都', tag: '生活', updated: '3 天前', body: FILES[2].body },
    ] },
    { id: 'f0', type: 'file', name: '排版指南.md', tag: '示例', updated: '刚刚', body: ARTICLE },
  ];

  window.MD_SAMPLE = { NOTE, FILES, ARTICLE, TREE };
})();
