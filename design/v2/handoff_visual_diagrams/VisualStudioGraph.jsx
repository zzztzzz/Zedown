/* VisualStudioGraph.jsx — shared drag canvas for the node-graph diagram kinds:
   flowchart / state / mindmap / class. Exposes window.VS_GraphEditor and the
   shape helpers window.VS_SHAPES / window.VS_ShapeSVG / window.VS_miniShape.
   Props: { t, kind, onMermaid } — calls onMermaid(str) whenever the graph changes. */
(function () {
  const { useState, useRef, useCallback, useEffect } = React;
  let _id = 0; const nid = function () { return 'g' + (++_id) + Math.random().toString(36).slice(2, 5); };

  const SHAPES = [
    { id: 'rect', label: '处理', hint: '处理 / 过程 · Process', wrap: function (x) { return '["' + x + '"]'; } },
    { id: 'round', label: '起止', hint: '起止 / 端点 · Terminator', wrap: function (x) { return '(["' + x + '"])'; } },
    { id: 'circle', label: '连接', hint: '连接点 · Connector', wrap: function (x) { return '(("' + x + '"))'; } },
    { id: 'diamond', label: '判断', hint: '判断 / 决策 · Decision', wrap: function (x) { return '{"' + x + '"}'; } },
    { id: 'para', label: '数据', hint: '数据 / 输入输出 · Data (I/O)', wrap: function (x) { return '[/"' + x + '"/]'; } },
    { id: 'hex', label: '准备', hint: '准备 · Preparation', wrap: function (x) { return '{{"' + x + '"}}'; } },
    { id: 'sub', label: '子流程', hint: '子流程 / 预定义过程 · Predefined', wrap: function (x) { return '[["' + x + '"]]'; } },
    { id: 'db', label: '存储', hint: '数据库 / 存储 · Database', wrap: function (x) { return '[("' + x + '")]'; } },
  ];
  const shapeWrap = function (id) { const s = SHAPES.find(function (x) { return x.id === id; }); return s ? s.wrap : SHAPES[0].wrap; };

  function ShapeSVG(props) {
    const { shape, w, h, fill, stroke, sw } = props;
    const common = { fill: fill, stroke: stroke, strokeWidth: sw, strokeLinejoin: 'round' };
    let el;
    if (shape === 'start') el = React.createElement('circle', { cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 - sw, fill: stroke, stroke: stroke, strokeWidth: sw });
    else if (shape === 'final') el = React.createElement('circle', Object.assign({ cx: w / 2, cy: h / 2, rx: 0, r: Math.min(w, h) / 2 - sw }, common));
    else if (shape === 'circle') el = React.createElement('ellipse', Object.assign({ cx: w / 2, cy: h / 2, rx: w / 2 - sw, ry: h / 2 - sw }, common));
    else if (shape === 'round') el = React.createElement('rect', Object.assign({ x: sw, y: sw, width: w - 2 * sw, height: h - 2 * sw, rx: (h - 2 * sw) / 2 }, common));
    else if (shape === 'diamond') el = React.createElement('polygon', Object.assign({ points: [w / 2 + ',' + sw, (w - sw) + ',' + h / 2, w / 2 + ',' + (h - sw), sw + ',' + h / 2].join(' ') }, common));
    else if (shape === 'para') el = React.createElement('polygon', Object.assign({ points: [(16 + sw) + ',' + sw, (w - sw) + ',' + sw, (w - 16 - sw) + ',' + (h - sw), sw + ',' + (h - sw)].join(' ') }, common));
    else if (shape === 'hex') el = React.createElement('polygon', Object.assign({ points: [14 + ',' + sw, (w - 14) + ',' + sw, (w - sw) + ',' + h / 2, (w - 14) + ',' + (h - sw), 14 + ',' + (h - sw), sw + ',' + h / 2].join(' ') }, common));
    else if (shape === 'db') el = React.createElement('path', Object.assign({ d: 'M' + sw + ',' + (7 + sw) + ' a' + (w / 2 - sw) + ',7 0 0 1 ' + (w - 2 * sw) + ',0 v' + (h - 14 - 2 * sw) + ' a' + (w / 2 - sw) + ',7 0 0 1 -' + (w - 2 * sw) + ',0 z' }, common));
    else el = React.createElement('rect', Object.assign({ x: sw, y: sw, width: w - 2 * sw, height: h - 2 * sw, rx: 7 }, common));
    const extra = [];
    if (shape === 'final') extra.push(React.createElement('circle', { key: 'inner', cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2 - sw - 4, fill: stroke }));
    if (shape === 'sub') { extra.push(React.createElement('line', { key: 'l', x1: 8, y1: sw, x2: 8, y2: h - sw, stroke: stroke, strokeWidth: sw })); extra.push(React.createElement('line', { key: 'r', x1: w - 8, y1: sw, x2: w - 8, y2: h - sw, stroke: stroke, strokeWidth: sw })); }
    if (shape === 'db') extra.push(React.createElement('path', { key: 'lid', d: 'M' + sw + ',' + (7 + sw) + ' a' + (w / 2 - sw) + ',7 0 0 0 ' + (w - 2 * sw) + ',0', fill: 'none', stroke: stroke, strokeWidth: sw }));
    return React.createElement('svg', { width: w, height: h, style: { position: 'absolute', inset: 0, overflow: 'visible' } }, [React.cloneElement(el, { key: 'main' })].concat(extra));
  }

  function miniShape(id, c) {
    const p = { fill: 'none', stroke: c, strokeWidth: 1.4, strokeLinejoin: 'round' };
    if (id === 'start') return React.createElement('circle', { cx: 13, cy: 8.5, r: 5, fill: c, stroke: c });
    if (id === 'final') return React.createElement('g', {}, [React.createElement('circle', Object.assign({ key: 'o', cx: 13, cy: 8.5, r: 6 }, p)), React.createElement('circle', { key: 'i', cx: 13, cy: 8.5, r: 3, fill: c })]);
    if (id === 'round') return React.createElement('rect', Object.assign({ x: 1, y: 3, width: 24, height: 11, rx: 5.5 }, p));
    if (id === 'circle') return React.createElement('ellipse', Object.assign({ cx: 13, cy: 8.5, rx: 7, ry: 7 }, p));
    if (id === 'diamond') return React.createElement('polygon', Object.assign({ points: '13,1 25,8.5 13,16 1,8.5' }, p));
    if (id === 'para') return React.createElement('polygon', Object.assign({ points: '5,3 25,3 21,14 1,14' }, p));
    if (id === 'hex') return React.createElement('polygon', Object.assign({ points: '6,3 20,3 25,8.5 20,14 6,14 1,8.5' }, p));
    if (id === 'sub') return React.createElement('g', {}, [React.createElement('rect', Object.assign({ key: 'r', x: 1, y: 3, width: 24, height: 11, rx: 1.5 }, p)), React.createElement('line', { key: 'a', x1: 5, y1: 3, x2: 5, y2: 14, stroke: c, strokeWidth: 1.4 }), React.createElement('line', { key: 'b', x1: 21, y1: 3, x2: 21, y2: 14, stroke: c, strokeWidth: 1.4 })]);
    if (id === 'db') return React.createElement('g', {}, [React.createElement('path', Object.assign({ key: 'b', d: 'M1,4 v9 a12,3 0 0 0 24,0 v-9' }, p)), React.createElement('ellipse', Object.assign({ key: 't', cx: 13, cy: 4, rx: 12, ry: 3 }, p))]);
    return React.createElement('rect', Object.assign({ x: 1, y: 3, width: 24, height: 11, rx: 2 }, p));
  }

  // ---- per-kind seed graphs ----
  function seed(kind) {
    const a = nid(), b = nid(), c = nid();
    if (kind === 'state') { var s0 = nid(); return {
      nodes: [{ id: s0, x: 290, y: 30, w: 38, h: 38, label: '', shape: 'start' }, { id: a, x: 240, y: 110, w: 120, h: 46, label: '草稿', shape: 'round' }, { id: b, x: 240, y: 220, w: 120, h: 46, label: '编辑中', shape: 'round' }, { id: c, x: 240, y: 330, w: 120, h: 46, label: '已保存', shape: 'round' }],
      edges: [{ from: s0, to: a }, { from: a, to: b, label: '打开' }, { from: b, to: c, label: '保存' }],
    }; }
    if (kind === 'mindmap') return {
      nodes: [{ id: a, x: 300, y: 180, w: 120, h: 48, label: '中心主题', shape: 'circle' }, { id: b, x: 120, y: 90, w: 110, h: 42, label: '分支一', shape: 'round' }, { id: c, x: 120, y: 270, w: 110, h: 42, label: '分支二', shape: 'round' }],
      edges: [{ from: a, to: b }, { from: a, to: c }],
    };
    if (kind === 'class') return {
      nodes: [{ id: a, x: 130, y: 70, w: 150, h: 0, label: '笔记', members: ['+string 标题', '+string 正文', '+保存()'], shape: 'rect' }, { id: b, x: 380, y: 90, w: 150, h: 0, label: '文件夹', members: ['+string 名称'], shape: 'rect' }],
      edges: [{ from: b, to: a, label: '包含' }],
    };
    // flowchart
    return {
      nodes: [{ id: a, x: 250, y: 50, w: 124, h: 48, label: '开始', shape: 'round' }, { id: b, x: 250, y: 175, w: 124, h: 56, label: '是否通过?', shape: 'diamond' }, { id: c, x: 250, y: 310, w: 124, h: 48, label: '结束', shape: 'round' }],
      edges: [{ from: a, to: b }, { from: b, to: c, label: '是' }],
    };
  }

  function classHeight(n) { return 30 + (n.members ? n.members.length : 0) * 20 + 8; }

  function VS_GraphEditor(props) {
    const { t, kind, onMermaid, onSVG, onGraph, initialGraph } = props;
    const initRef = useRef(null);
    if (!initRef.current) initRef.current = (initialGraph && initialGraph.kind === kind && initialGraph.nodes) ? { kind: kind, nodes: initialGraph.nodes, edges: initialGraph.edges || [] } : Object.assign({ kind: kind }, seed(kind));
    const [nodes, setNodes] = useState(initRef.current.nodes);
    const [edges, setEdges] = useState(initRef.current.edges);
    const [sel, setSel] = useState(null);
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState('');
    const [newShape, setNewShape] = useState('rect');
    const [newStyle, setNewStyle] = useState({ fill: '', stroke: '', text: '' });
    const drag = useRef(null); const conn = useRef(null);
    const dragNew = useRef(null);
    const [ghost, setGhost] = useState(null);
    const [connPt, setConnPt] = useState(null);
    const canvasRef = useRef(null);

    // reseed when kind changes (but not on first mount, to preserve initialGraph)
    const lastKind = useRef(kind);
    useEffect(function () { if (lastKind.current !== kind) { lastKind.current = kind; const s = seed(kind); setNodes(s.nodes); setEdges(s.edges); setSel(null); } }, [kind]);

    const nodeById = function (id) { return nodes.find(function (n) { return n.id === id; }); };
    const hOf = function (n) { return kind === 'class' ? classHeight(n) : n.h; };
    function pt(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function nodeAt(p) { for (let i = nodes.length - 1; i >= 0; i--) { const n = nodes[i]; if (p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + hOf(n)) return n; } return null; }

    const onMove = useCallback(function (e) {
      if (drag.current) { const p = pt(e); const d = drag.current; setNodes(function (ns) { return ns.map(function (n) { return n.id === d.id ? Object.assign({}, n, { x: Math.max(0, p.x - d.ox), y: Math.max(0, p.y - d.oy) }) : n; }); }); }
      else if (conn.current) setConnPt(pt(e));
      else if (dragNew.current) setGhost({ x: e.clientX, y: e.clientY, shape: dragNew.current.shape });
    }, [nodes]);
    const onUp = useCallback(function (e) {
      if (conn.current) {
        const target = nodeAt(pt(e));
        if (target && target.id !== conn.current.from) {
          const from = conn.current.from, to = target.id;
          setEdges(function (es) {
            if (kind === 'mindmap') { const filtered = es.filter(function (x) { return x.to !== to; }); return filtered.concat([{ from: from, to: to }]); }
            return es.some(function (x) { return x.from === from && x.to === to; }) ? es : es.concat([{ from: from, to: to }]);
          });
        }
        conn.current = null; setConnPt(null);
      }
      drag.current = null;
      if (dragNew.current) {
        const r = canvasRef.current.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          createNodeAt(dragNew.current.shape, e.clientX - r.left, e.clientY - r.top);
        }
        dragNew.current = null; setGhost(null);
      }
    }, [nodes, kind, newShape, newStyle]);
    useEffect(function () { window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); return function () { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }; }, [onMove, onUp]);
    useEffect(function () { function k(e) { if (editing) return; if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); } } window.addEventListener('keydown', k); return function () { window.removeEventListener('keydown', k); }; }, [sel, editing]);

    function removeSel() {
      if (!sel) return;
      if (sel.type === 'node') { setNodes(function (ns) { return ns.filter(function (n) { return n.id !== sel.id; }); }); setEdges(function (es) { return es.filter(function (x) { return x.from !== sel.id && x.to !== sel.id; }); }); }
      else setEdges(function (es) { return es.filter(function (x) { return (x.from + '>' + x.to) !== sel.id; }); });
      setSel(null);
    }
    function makeNode(shape, x, y) {
      const id = nid();
      if (kind === 'class') return { id: id, x: x, y: y, w: 150, h: 0, label: '新类', members: ['+成员'], shape: 'rect' };
      if (kind === 'state' && (shape === 'start' || shape === 'final')) return { id: id, x: x, y: y, w: 38, h: 38, label: '', shape: shape };
      const useShape = (kind === 'flowchart' || kind === 'state') ? shape : 'round';
      return { id: id, x: x, y: y, w: 124, h: (kind === 'flowchart' && shape === 'diamond') ? 56 : 48, label: '节点', shape: kind === 'flowchart' ? shape : (useShape === 'start' || useShape === 'final' ? 'round' : useShape), fill: kind === 'flowchart' ? newStyle.fill : '', stroke: kind === 'flowchart' ? newStyle.stroke : '', textColor: kind === 'flowchart' ? newStyle.text : '' };
    }
    function addNode() {
      const node = makeNode(newShape, 80 + Math.random() * 120, 80 + Math.random() * 120);
      setNodes(function (ns) { return ns.concat([node]); }); setSel({ type: 'node', id: node.id }); startEdit(node.id, node);
    }
    function createNodeAt(shape, x, y) {
      const node = makeNode(shape, Math.max(0, x - 62), Math.max(0, y - 24));
      setNodes(function (ns) { return ns.concat([node]); }); setSel({ type: 'node', id: node.id });
    }
    function startEdit(id, n) { setEditing(id); setDraft(kind === 'class' ? ([n.label].concat(n.members || []).join('\n')) : n.label); }
    function commitEdit() {
      if (editing) setNodes(function (ns) { return ns.map(function (n) {
        if (n.id !== editing) return n;
        if (kind === 'class') { const lines = draft.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); return Object.assign({}, n, { label: lines[0] || '类', members: lines.slice(1) }); }
        return Object.assign({}, n, { label: draft.trim() || '节点' });
      }); });
      setEditing(null);
    }
    function startDrag(e, n) { e.stopPropagation(); const p = pt(e); drag.current = { id: n.id, ox: p.x - n.x, oy: p.y - n.y }; setSel({ type: 'node', id: n.id }); }
    function startConn(e, n) { e.stopPropagation(); conn.current = { from: n.id }; setConnPt(pt(e)); }
    function setShape(id, shape) { setNodes(function (ns) { return ns.map(function (n) { return n.id === id ? Object.assign({}, n, { shape: shape, h: shape === 'diamond' ? Math.max(n.h, 56) : n.h }) : n; }); }); }
    function setNodeStyle(id, patch) { setNodes(function (ns) { return ns.map(function (n) { return n.id === id ? Object.assign({}, n, patch) : n; }); }); }
    function applyStyle(key, val) { if (selNode) setNodeStyle(selNode.id, { [key === 'text' ? 'textColor' : key]: val }); else setNewStyle(function (s) { return Object.assign({}, s, { [key]: val }); }); }
    function toggleDash(eid) { setEdges(function (es) { return es.map(function (x) { return (x.from + '>' + x.to) === eid ? Object.assign({}, x, { dashed: !x.dashed }) : x; }); }); }
    function labelEdge(eid) { const e = edges.find(function (x) { return (x.from + '>' + x.to) === eid; }); const v = prompt('连线文字(可留空):', e && e.label || ''); if (v !== null) setEdges(function (es) { return es.map(function (x) { return (x.from + '>' + x.to) === eid ? Object.assign({}, x, { label: v }) : x; }); }); }

    function anchor(a, b) {
      const ah = hOf(a), bh = hOf(b);
      const ax = a.x + a.w / 2, ay = a.y + ah / 2, bx = b.x + b.w / 2, by = b.y + bh / 2;
      function clip(cx, cy, w, h, tx, ty) { const hw = w / 2, hh = h / 2, ux = tx - cx, uy = ty - cy; if (!ux && !uy) return { x: cx, y: cy }; const s = Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity); return { x: cx + ux * s, y: cy + uy * s }; }
      return { p1: clip(ax, ay, a.w, ah, bx, by), p2: clip(bx, by, b.w, bh, ax, ay) };
    }

    // ---- export ----
    function sanit(s) { return s.replace(/"/g, ''); }
    function exportMermaid() {
      const idMap = {}; nodes.forEach(function (n, i) { idMap[n.id] = 'N' + (i + 1); });
      let out = '';
      if (kind === 'flowchart') {
        out = 'flowchart TD\n';
        nodes.forEach(function (n) { out += '  ' + idMap[n.id] + shapeWrap(n.shape)(sanit(n.label)) + '\n'; });
        edges.forEach(function (e) { if (idMap[e.from] && idMap[e.to]) { const link = e.dashed ? (e.label ? '-. ' + sanit(e.label) + ' .->' : '-.->') : (e.label ? '-->|' + sanit(e.label) + '|' : '-->'); out += '  ' + idMap[e.from] + ' ' + link + ' ' + idMap[e.to] + '\n'; } });
        nodes.forEach(function (n) { const parts = []; if (n.fill) parts.push('fill:' + n.fill); if (n.stroke) parts.push('stroke:' + n.stroke); if (n.textColor) parts.push('color:' + n.textColor); if (parts.length) out += '  style ' + idMap[n.id] + ' ' + parts.join(',') + '\n'; });
      } else if (kind === 'state') {
        out = 'stateDiagram-v2\n';
        const tok = function (n) { return (n.shape === 'start' || n.shape === 'final') ? '[*]' : idMap[n.id]; };
        nodes.forEach(function (n) { if (n.shape !== 'start' && n.shape !== 'final') out += '  state "' + sanit(n.label) + '" as ' + idMap[n.id] + '\n'; });
        const anyStart = nodes.some(function (n) { return n.shape === 'start'; });
        if (!anyStart) { const hasIncoming = {}; edges.forEach(function (e) { hasIncoming[e.to] = 1; }); const root = nodes.find(function (n) { return n.shape !== 'final' && !hasIncoming[n.id]; }); if (root) out += '  [*] --> ' + idMap[root.id] + '\n'; }
        edges.forEach(function (e) { const a = nodeById(e.from), b = nodeById(e.to); if (a && b) out += '  ' + tok(a) + ' --> ' + tok(b) + (e.label ? ' : ' + sanit(e.label) : '') + '\n'; });
      } else if (kind === 'class') {
        out = 'classDiagram\n';
        nodes.forEach(function (n) {
          const nm = sanit(n.label).replace(/\s+/g, '');
          out += '  class ' + nm + ' {\n';
          (n.members || []).forEach(function (m) { out += '    ' + sanit(m) + '\n'; });
          out += '  }\n';
        });
        edges.forEach(function (e) { const a = nodeById(e.from), b = nodeById(e.to); if (a && b) out += '  ' + sanit(a.label).replace(/\s+/g, '') + ' --> ' + sanit(b.label).replace(/\s+/g, '') + (e.label ? ' : ' + sanit(e.label) : '') + '\n'; });
      } else { // mindmap
        out = 'mindmap\n';
        const childMap = {}; edges.forEach(function (e) { (childMap[e.from] = childMap[e.from] || []).push(e.to); });
        const hasParent = {}; edges.forEach(function (e) { hasParent[e.to] = 1; });
        const root = nodes.find(function (n) { return !hasParent[n.id]; }) || nodes[0];
        const seen = {};
        function walk(id, depth) {
          if (!id || seen[id]) return; seen[id] = 1;
          const n = nodeById(id); if (!n) return;
          const indent = '  '.repeat(depth + 1);
          out += indent + (depth === 0 ? 'root((' + sanit(n.label) + '))' : sanit(n.label)) + '\n';
          (childMap[id] || []).forEach(function (c) { walk(c, depth + 1); });
        }
        if (root) walk(root.id, 0);
      }
      return out.trim();
    }
    function exportSVG() { return graphToSVG({ kind: kind, nodes: nodes, edges: edges }, t); }
    useEffect(function () { if (onMermaid) onMermaid(exportMermaid()); if (onSVG) onSVG(exportSVG()); if (onGraph) onGraph({ kind: kind, nodes: nodes, edges: edges }); }, [nodes, edges, kind]);

    const accent = t.accent;
    const selNode = sel && sel.type === 'node' ? nodeById(sel.id) : null;
    const showShapes = kind === 'flowchart' || kind === 'state';
    const paletteShapes = kind === 'state' ? [{ id: 'round', label: '状态' }, { id: 'start', label: '起始' }, { id: 'final', label: '结束' }] : SHAPES;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {showShapes && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderBottom: '1px solid ' + t.border, background: t.surface2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: t.faint, marginRight: 2 }}>拖形状到画布 →</span>
            {paletteShapes.map(function (s) {
              const on = selNode && selNode.shape === s.id;
              return (
                <button key={s.id} title={(s.hint || s.label) + ' · 拖到画布创建'}
                  onPointerDown={function (e) { e.preventDefault(); dragNew.current = { shape: s.id }; setGhost({ x: e.clientX, y: e.clientY, shape: s.id }); }}
                  onClick={function () { if (selNode) setShape(selNode.id, s.id); else setNewShape(s.id); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'grab', padding: '4px 8px 4px 5px', height: 28, border: '1px solid ' + (on ? accent : t.border), borderRadius: t.radius - 3, background: on ? t.accentSoft : t.surface, color: on ? accent : t.muted, fontFamily: t.fontUI, fontSize: 11.5, fontWeight: 600, touchAction: 'none' }}>
                  <svg width="26" height="17" viewBox="0 0 26 17" style={{ overflow: 'visible' }}>{miniShape(s.id, on ? accent : t.muted)}</svg>{s.label}
                </button>
              );
            })}
          </div>
        )}
        {showShapes && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '7px 14px', borderBottom: '1px solid ' + t.border, background: t.surface2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: t.faint }}>{selNode ? '所选节点:' : '新节点默认:'}</span>
            <ColorControl t={t} accent={accent} label="底色" kind="fill" value={selNode ? (selNode.fill || '') : newStyle.fill} onPick={function (v) { applyStyle('fill', v); }} />
            <ColorControl t={t} accent={accent} label="边框" kind="stroke" value={selNode ? (selNode.stroke || '') : newStyle.stroke} onPick={function (v) { applyStyle('stroke', v); }} />
            <ColorControl t={t} accent={accent} label="文字" kind="text" value={selNode ? (selNode.textColor || '') : newStyle.text} onPick={function (v) { applyStyle('text', v); }} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '1px solid ' + t.border, background: t.surface2 }}>
          <span style={{ fontSize: 11.5, color: t.faint }}>
            {kind === 'mindmap' ? '从父节点圆点拉到子节点建立层级' : kind === 'class' ? '双击类框编辑:第一行=类名,其余=成员' : '拖动移动 · 拉底部圆点连线 · 双击改名'}
          </span>
          <div style={{ flex: 1 }} />
          {sel && sel.type === 'edge' && <button onClick={function () { labelEdge(sel.id); }} style={btn(t, false)}>连线文字</button>}
          {sel && sel.type === 'edge' && <button onClick={function () { toggleDash(sel.id); }} style={btn(t, false)}>实线/虚线</button>}
          <button onClick={removeSel} disabled={!sel} style={Object.assign({}, btn(t, false), { opacity: sel ? 1 : .4 })}>删除</button>
          <button onClick={addNode} style={btn(t, false)}>＋ {kind === 'class' ? '添加类' : '添加节点'}</button>
        </div>

        <div ref={canvasRef} onPointerDown={function () { setSel(null); }} style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: drag.current ? 'grabbing' : 'default', background: t.surface2, backgroundImage: 'radial-gradient(' + t.border + ' 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <marker id="vs-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,3 L0,6 Z" fill={t.muted} /></marker>
              <marker id="vs-arrow-sel" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,3 L0,6 Z" fill={accent} /></marker>
            </defs>
            {edges.map(function (e) {
              const a = nodeById(e.from), b = nodeById(e.to); if (!a || !b) return null;
              const an = anchor(a, b); const eid = e.from + '>' + e.to;
              const on = sel && sel.type === 'edge' && sel.id === eid;
              const mid = { x: (an.p1.x + an.p2.x) / 2, y: (an.p1.y + an.p2.y) / 2 };
              const noArrow = kind === 'mindmap';
              return (
                <g key={eid}>
                  <line x1={an.p1.x} y1={an.p1.y} x2={an.p2.x} y2={an.p2.y} stroke={on ? accent : t.muted} strokeWidth={on ? 2.5 : 1.8} strokeDasharray={e.dashed ? '6 5' : undefined} markerEnd={noArrow ? undefined : ('url(#' + (on ? 'vs-arrow-sel' : 'vs-arrow') + ')')} />
                  <line x1={an.p1.x} y1={an.p1.y} x2={an.p2.x} y2={an.p2.y} stroke="transparent" strokeWidth="14" style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onPointerDown={function (ev) { ev.stopPropagation(); setSel({ type: 'edge', id: eid }); }} onDoubleClick={function () { labelEdge(eid); }} />
                  {e.label && <g><rect x={mid.x - e.label.length * 4 - 4} y={mid.y - 9} width={e.label.length * 8 + 8} height={18} rx={4} fill={t.surface} stroke={t.border} /><text x={mid.x} y={mid.y + 4} textAnchor="middle" fontSize="11" fill={t.muted} style={{ fontFamily: t.fontUI }}>{e.label}</text></g>}
                </g>
              );
            })}
            {connPt && conn.current && (function () { const a = nodeById(conn.current.from); if (!a) return null; return <line x1={a.x + a.w / 2} y1={a.y + hOf(a)} x2={connPt.x} y2={connPt.y} stroke={accent} strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#vs-arrow-sel)" />; })()}
          </svg>

          {nodes.map(function (n) {
            const on = sel && sel.type === 'node' && sel.id === n.id;
            const H = hOf(n);
            if (kind === 'class') {
              return (
                <div key={n.id} onPointerDown={function (e) { startDrag(e, n); }} onDoubleClick={function (e) { e.stopPropagation(); startEdit(n.id, n); }}
                  style={{ position: 'absolute', left: n.x, top: n.y, width: n.w, minHeight: H, cursor: 'grab', userSelect: 'none', background: t.surface, border: '1.5px solid ' + (on ? accent : t.borderStrong), borderRadius: t.radius, boxShadow: on ? '0 0 0 3px ' + t.accentSoft : t.shadow, overflow: 'hidden' }}>
                  {editing === n.id
                    ? <textarea autoFocus value={draft} onChange={function (e) { setDraft(e.target.value); }} onBlur={commitEdit} onPointerDown={function (e) { e.stopPropagation(); }} onKeyDown={function (e) { if (e.key === 'Escape') setEditing(null); }} style={{ width: '100%', height: H + 10, border: 'none', outline: 'none', resize: 'none', background: 'transparent', color: t.text, fontSize: 12, fontFamily: t.fontMono, padding: 8, boxSizing: 'border-box' }} />
                    : <React.Fragment>
                        <div style={{ fontWeight: 700, fontSize: 13, textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid ' + t.border, background: t.surface2 }}>{n.label}</div>
                        <div style={{ padding: '6px 10px' }}>{(n.members || []).map(function (m, i) { return <div key={i} style={{ fontSize: 11.5, fontFamily: t.fontMono, color: t.muted, lineHeight: 1.7 }}>{m}</div>; })}</div>
                      </React.Fragment>}
                  <div title="拖我连线" onPointerDown={function (e) { startConn(e, n); }} style={{ position: 'absolute', bottom: -7, left: '50%', marginLeft: -6, width: 12, height: 12, borderRadius: '50%', background: accent, border: '2px solid ' + t.surface, cursor: 'crosshair', opacity: on ? 1 : .5 }} />
                </div>
              );
            }
            return (
              <div key={n.id} onPointerDown={function (e) { startDrag(e, n); }} onDoubleClick={function (e) { e.stopPropagation(); startEdit(n.id, n); }} style={{ position: 'absolute', left: n.x, top: n.y, width: n.w, height: H, cursor: 'grab', userSelect: 'none' }}>
                <ShapeSVG shape={n.shape} w={n.w} h={H} fill={n.fill || t.surface} stroke={on ? accent : (n.stroke || t.borderStrong)} sw={on ? 2.2 : 1.5} />
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: '0 12px', boxSizing: 'border-box', fontSize: 12.5, fontWeight: 600, color: n.textColor || t.text, pointerEvents: 'none' }}>
                  {editing === n.id
                    ? <input autoFocus value={draft} onChange={function (e) { setDraft(e.target.value); }} onBlur={commitEdit} onPointerDown={function (e) { e.stopPropagation(); }} onKeyDown={function (e) { if (e.key === 'Enter') { e.preventDefault(); commitEdit(); } if (e.key === 'Escape') setEditing(null); }} style={{ width: '86%', border: 'none', outline: 'none', background: 'transparent', textAlign: 'center', color: t.text, fontSize: 12.5, fontWeight: 600, fontFamily: t.fontUI, pointerEvents: 'auto' }} />
                    : n.label}
                </div>
                <div title="拖我连线" onPointerDown={function (e) { startConn(e, n); }} style={{ position: 'absolute', bottom: -7, left: '50%', marginLeft: -6, width: 12, height: 12, borderRadius: '50%', background: accent, border: '2px solid ' + t.surface, cursor: 'crosshair', opacity: on ? 1 : .5 }} />
              </div>
            );
          })}
        </div>
        {ghost && (
          <div style={{ position: 'fixed', left: ghost.x - 40, top: ghost.y - 18, width: 80, height: 36, pointerEvents: 'none', zIndex: 90, opacity: .8 }}>
            <svg width="80" height="36" viewBox="0 0 80 36" style={{ overflow: 'visible' }}>
              <g transform="scale(3.05,2.1)">{miniShape(ghost.shape, accent)}</g>
            </svg>
          </div>
        )}
      </div>
    );
  }

  // preset palettes per channel + native picker
  const PRESETS = {
    fill: ['', '#eef1fb', '#f2eefb', '#fbeef2', '#fbf6e6', '#e9f6ee', '#ffffff'],
    stroke: ['', '#7b8fd6', '#9b7bd6', '#d67b9b', '#d6b24f', '#5aa97b', '#555555'],
    text: ['', '#2f3e8c', '#5a3e9c', '#9c3e5a', '#8a6a14', '#1f6a44', '#1a1a1a'],
  };
  function ColorControl(props) {
    const { t, accent, label, kind, value, onPick } = props;
    const presets = PRESETS[kind] || [];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11.5, color: t.muted, fontWeight: 600 }}>{label}</span>
        {presets.map(function (c) {
          const on = (value || '') === c;
          return (
            <button key={c || 'none'} title={c || '默认'} onClick={function () { onPick(c); }}
              style={{ width: 19, height: 19, cursor: 'pointer', borderRadius: '50%', padding: 0, display: 'grid', placeItems: 'center', background: c || t.surface, border: '2px solid ' + (on ? accent : t.borderStrong), boxShadow: on ? '0 0 0 2px ' + t.accentSoft : 'none' }}>
              {!c && <span style={{ fontSize: 10, color: t.faint }}>⊘</span>}
            </button>
          );
        })}
        <label title="自定义(拾色板)" style={{ width: 19, height: 19, cursor: 'pointer', borderRadius: '50%', overflow: 'hidden', position: 'relative', border: '2px solid ' + t.borderStrong, background: 'conic-gradient(red,orange,yellow,lime,aqua,blue,magenta,red)' }}>
          <input type="color" value={value && value[0] === '#' ? value : '#888888'} onChange={function (e) { onPick(e.target.value); }} style={{ position: 'absolute', inset: -4, width: 30, height: 30, border: 'none', padding: 0, opacity: 0, cursor: 'pointer' }} />
        </label>
      </div>
    );
  }

  function btn(t, primary) { return { border: primary ? 'none' : '1px solid ' + t.border, background: primary ? t.accent : t.surface, color: primary ? t.accentText : t.muted, cursor: 'pointer', borderRadius: t.radius - 2, padding: '6px 12px', fontSize: 12, fontWeight: primary ? 700 : 600, fontFamily: t.fontUI }; }

  // ---- exact-canvas SVG export helpers ----
  function svgEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function shapeMarkup(shape, w, h, fill, stroke, sw) {
    const c = 'fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linejoin="round"';
    if (shape === 'start') return '<circle cx="' + w / 2 + '" cy="' + h / 2 + '" r="' + (Math.min(w, h) / 2 - sw) + '" fill="' + stroke + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    if (shape === 'final') return '<circle cx="' + w / 2 + '" cy="' + h / 2 + '" r="' + (Math.min(w, h) / 2 - sw) + '" ' + c + '/><circle cx="' + w / 2 + '" cy="' + h / 2 + '" r="' + (Math.min(w, h) / 2 - sw - 4) + '" fill="' + stroke + '"/>';
    if (shape === 'circle') return '<ellipse cx="' + w / 2 + '" cy="' + h / 2 + '" rx="' + (w / 2 - sw) + '" ry="' + (h / 2 - sw) + '" ' + c + '/>';
    if (shape === 'round') return '<rect x="' + sw + '" y="' + sw + '" width="' + (w - 2 * sw) + '" height="' + (h - 2 * sw) + '" rx="' + ((h - 2 * sw) / 2) + '" ' + c + '/>';
    if (shape === 'diamond') return '<polygon points="' + [w / 2 + ',' + sw, (w - sw) + ',' + h / 2, w / 2 + ',' + (h - sw), sw + ',' + h / 2].join(' ') + '" ' + c + '/>';
    if (shape === 'para') return '<polygon points="' + [(16 + sw) + ',' + sw, (w - sw) + ',' + sw, (w - 16 - sw) + ',' + (h - sw), sw + ',' + (h - sw)].join(' ') + '" ' + c + '/>';
    if (shape === 'hex') return '<polygon points="' + [14 + ',' + sw, (w - 14) + ',' + sw, (w - sw) + ',' + h / 2, (w - 14) + ',' + (h - sw), 14 + ',' + (h - sw), sw + ',' + h / 2].join(' ') + '" ' + c + '/>';
    if (shape === 'db') { const lid = '<path d="M' + sw + ',' + (7 + sw) + ' a' + (w / 2 - sw) + ',7 0 0 0 ' + (w - 2 * sw) + ',0" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"/>'; return '<path d="M' + sw + ',' + (7 + sw) + ' a' + (w / 2 - sw) + ',7 0 0 1 ' + (w - 2 * sw) + ',0 v' + (h - 14 - 2 * sw) + ' a' + (w / 2 - sw) + ',7 0 0 1 -' + (w - 2 * sw) + ',0 z" ' + c + '/>' + lid; }
    let r = '<rect x="' + sw + '" y="' + sw + '" width="' + (w - 2 * sw) + '" height="' + (h - 2 * sw) + '" rx="7" ' + c + '/>';
    if (shape === 'sub') r += '<line x1="8" y1="' + sw + '" x2="8" y2="' + (h - sw) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/><line x1="' + (w - 8) + '" y1="' + sw + '" x2="' + (w - 8) + '" y2="' + (h - sw) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    return r;
  }
  function classH(n) { return 30 + (n.members ? n.members.length : 0) * 20 + 8; }
  function gAnchor(a, b, ha, hb) {
    const ax = a.x + a.w / 2, ay = a.y + ha / 2, bx = b.x + b.w / 2, by = b.y + hb / 2;
    function clip(cx, cy, w, h, tx, ty) { const hw = w / 2, hh = h / 2, ux = tx - cx, uy = ty - cy; if (!ux && !uy) return { x: cx, y: cy }; const s = Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity); return { x: cx + ux * s, y: cy + uy * s }; }
    return { p1: clip(ax, ay, a.w, ha, bx, by), p2: clip(bx, by, b.w, hb, ax, ay) };
  }
  // build a standalone, exact SVG of a graph {kind,nodes,edges} using theme tokens t
  function graphToSVG(g, t) {
    if (g.kind === 'mindmap' && window.VS_mindmapToSVG) return window.VS_mindmapToSVG(g, t);
    const kind = g.kind, nodes = g.nodes || [], edges = g.edges || [];
    if (!nodes.length) return '';
    const hOf = function (n) { return kind === 'class' ? classH(n) : n.h; };
    const byId = function (id) { return nodes.find(function (n) { return n.id === id; }); };
    let minX = 1e9, minY = 1e9, maxX = 0, maxY = 0;
    nodes.forEach(function (n) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + hOf(n)); });
    const pad = 24, ox = pad - minX, oy = pad - minY;
    const W = Math.round(maxX - minX + pad * 2), H = Math.round(maxY - minY + pad * 2);
    const noArrow = kind === 'mindmap';
    let body = '';
    edges.forEach(function (e) {
      const a = byId(e.from), b = byId(e.to); if (!a || !b) return;
      const an = gAnchor(a, b, hOf(a), hOf(b));
      body += '<line x1="' + an.p1.x + '" y1="' + an.p1.y + '" x2="' + an.p2.x + '" y2="' + an.p2.y + '" stroke="' + t.muted + '" stroke-width="1.8" ' + (e.dashed ? 'stroke-dasharray="6 5" ' : '') + (noArrow ? '' : 'marker-end="url(#vsa)" ') + '/>';
      if (e.label) { const mx = (an.p1.x + an.p2.x) / 2, my = (an.p1.y + an.p2.y) / 2, lw = e.label.length * 8 + 8; body += '<rect x="' + (mx - lw / 2) + '" y="' + (my - 9) + '" width="' + lw + '" height="18" rx="4" fill="' + t.surface + '" stroke="' + t.border + '"/><text x="' + mx + '" y="' + (my + 4) + '" text-anchor="middle" font-size="11" fill="' + t.muted + '">' + svgEsc(e.label) + '</text>'; }
    });
    nodes.forEach(function (n) {
      const H2 = hOf(n), fill = n.fill || t.surface, stroke = n.stroke || t.borderStrong, tc = n.textColor || t.text;
      body += '<g transform="translate(' + n.x + ',' + n.y + ')">';
      if (kind === 'class') {
        body += '<rect x="0" y="0" width="' + n.w + '" height="' + H2 + '" rx="' + (t.radius || 8) + '" fill="' + fill + '" stroke="' + stroke + '"/>';
        body += '<text x="' + n.w / 2 + '" y="20" text-anchor="middle" font-size="13" font-weight="700" fill="' + tc + '">' + svgEsc(n.label) + '</text>';
        body += '<line x1="0" y1="30" x2="' + n.w + '" y2="30" stroke="' + t.border + '"/>';
        (n.members || []).forEach(function (m, i) { body += '<text x="10" y="' + (48 + i * 20) + '" font-size="11.5" fill="' + t.muted + '" font-family="monospace">' + svgEsc(m) + '</text>'; });
      } else {
        body += shapeMarkup(n.shape, n.w, H2, fill, stroke, 1.5);
        body += '<text x="' + n.w / 2 + '" y="' + H2 / 2 + '" text-anchor="middle" dominant-baseline="central" font-size="12.5" font-weight="600" fill="' + tc + '">' + svgEsc(n.label) + '</text>';
      }
      body += '</g>';
    });
    const ff = (t.fontUI || 'sans-serif').replace(/"/g, '');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + ff + '"><rect width="' + W + '" height="' + H + '" fill="' + t.surface + '"/><defs><marker id="vsa" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,3 L0,6 Z" fill="' + t.muted + '"/></marker></defs><g transform="translate(' + ox + ',' + oy + ')">' + body + '</g></svg>';
  }
  window.VS_graphToSVG = graphToSVG;

  window.VS_SHAPES = SHAPES;
  window.VS_ShapeSVG = ShapeSVG;
  window.VS_GraphEditor = VS_GraphEditor;
  window.VS_btn = btn;
})();
