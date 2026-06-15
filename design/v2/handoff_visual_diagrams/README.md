# Handoff（仅本次改动）: Zedown 可视化图表工作台 (Visual Diagram Studio)

> 本包**只包含本次新增/改动的部分** —— 一套"可视化画图"功能,可嵌入任意 Markdown 编辑器。
> 它是设计参考原型(React + 内联 JSX),目标是在你的代码库里用既有技术栈重建,而非直接发布。

## 这次做了什么
给 Markdown 编辑器加了一个**可视化图表工作台**:用户不写 Mermaid 代码,而是**拖拽 / 填表**画图,画完插入笔记。支持 7 类图:

**画布拖拽类(节点+连线,自由布局)**
- **流程图**:8 种专业符号(处理/起止/连接/判断/数据/准备/子流程/存储),从形状栏**拖到画布**创建;**底色/边框/文字三通道独立配色**(预设色板 + 原生拾色板);连线可加文字、切实线/虚线。
- **状态图**:起始(●)/状态/结束(◉)三符号;连线文字=转换条件。
- **思维导图**:XMind 式,中心发散 + 左右平衡 + 彩色曲线 + 自动布局;Tab 加子主题 / Enter 加同级。
- **类图**:类框(双击编辑:首行类名、其余成员)+ 关系连线。

**可视表单类(填表+实时预览,走 Mermaid)**
- **时序图 / 饼图 / 甘特图**。

## 核心设计决策:画布类 = "可编辑的精确块"(关键!)
画布类图表既要**渲染和画布 1:1 一致**,又要**能二次编辑**。做法:
1. 插入笔记时,在 Markdown 里存一个 **` ```zdiagram ` 代码块**,内容是图形结构 JSON:`{kind, nodes, edges, ...}`(节点带 x/y/w/h/形状/颜色)。
2. 渲染时调 `window.VS_graphToSVG(graph, tokens)` 把 JSON 还原成**精确 SVG**(思维导图走 `window.VS_mindmapToSVG`)。不交给 Mermaid 自动布局(否则位置会变)。
3. 二次编辑:把块内 JSON 当 `initialGraph` 重新打开工作台,保存时**替换原块**。
4. 表单类(时序/饼/甘特)仍存为 ` ```mermaid ` 块,交给 Mermaid 渲染(已按主题 token 配色)。

## 文件
| 文件 | 作用 |
|---|---|
| `VisualStudio.jsx` | 工作台外壳:7 类型 tab、插入到笔记、按 kind 分派编辑器。`window.VisualStudio({t,onClose,onInsert,initialKind,initialGraph,themeId})` |
| `VisualStudioGraph.jsx` | 流程图/状态图/类图画布编辑器(拖拽/连线/形状/三通道配色)+ `window.VS_graphToSVG(graph,t)` 精确 SVG 导出 |
| `VisualStudioMindmap.jsx` | XMind 式思维导图(自动布局 + 曲线分支)+ `window.VS_mindmapToSVG(graph,t)` |
| `VisualStudioForms.jsx` | 时序图/饼图/甘特图表单编辑器(输出 mermaid 字符串) |
| `MathDiagram.js` | 渲染层:KaTeX/Mermaid **懒加载** + Mermaid 主题化 + `enhanceRendered(root,themeId)`(扫描 `.math-block`/`code[data-lang=mermaid]`/`code[data-lang=zdiagram]` 并渲染)+ `MD_renderMermaid(code,themeId)` |
| `themes.js` | 主题 token(`window.MD_TOKENS[id]`),SVG 构建需要它的 surface/text/muted/border/accent 等 |

## 组件契约(props / 全局)
- `window.VisualStudio({ t, themeId, initialKind, initialGraph, onClose, onInsert })`
  - `t` = `MD_TOKENS[themeId]`(颜色/字体 token)。
  - `onInsert(snippet)`:画布类回传 ` ```zdiagram\n{json}\n``` `;表单类回传裸 mermaid 字符串(宿主负责包 ` ```mermaid ` 围栏)。
  - `initialGraph`:重新编辑时传入已存的图 JSON。
- 各子编辑器通过 `onMermaid(str)` / `onGraph(graphObj)` / `onSVG(svgStr)` 回调向外吐数据。
- 渲染:在 Markdown 渲染成 HTML 后,对容器调用 `window.enhanceRendered(containerEl, themeId)`。

## 宿主集成点(在你的编辑器里要做的 3 处接线)
1. **打开**:工具栏放一个「可视化画图」按钮 → 渲染 `<VisualStudio>` 模态。
2. **插入**:`onInsert(snippet)` → 把 snippet 写入 Markdown 文本(画布类是 ` ```zdiagram `,表单类用 ` ```mermaid ` 包裹)。
3. **渲染 + 二次编辑**:Markdown→HTML 后调 `enhanceRendered`;再提供"编辑此图"入口(原型做法:光标落在 ` ```zdiagram ` 块时,在编辑区浮出「✎编辑/🗑删除」条;点编辑把块内 JSON 作为 `initialGraph` 重新打开工作台,保存替换原块)。**注意:编辑入口放在编辑区,不要放在只读阅读视图。**

## 数据结构
```ts
// zdiagram 块内 JSON
type Graph = {
  kind: 'flowchart'|'state'|'mindmap'|'class';
  nodes: { id; x; y; w; h; label; shape?; fill?; stroke?; textColor?; members?; isRoot?; bcolor? }[];
  edges: { from; to; label?; dashed? }[];
  root?: string;  // mindmap
};
```

## 技术栈说明
原型是 React 18 + 内联 JSX(`<script type="text/babel">`),各模块用 IIFE 挂到 `window`。生产请改为正常模块/构建;**Mermaid/KaTeX 需本地打包 + 懒加载**(MV3 禁远程代码,原型用 CDN 仅演示)。颜色 token 见 `themes.js`,接入时映射到你的设计系统。

## 加载顺序
themes.js → MathDiagram.js → VisualStudioGraph.jsx → VisualStudioMindmap.jsx → VisualStudioForms.jsx → VisualStudio.jsx(再被你的编辑器引用)。
