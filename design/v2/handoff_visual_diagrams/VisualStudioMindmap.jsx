/* VisualStudioMindmap.jsx — XMind-style mindmap editor: central topic with
   auto-laid-out, balanced left/right branches, curved colored connectors.
   Tab = add child, Enter = add sibling, Delete = remove subtree, dbl-click = rename.
   window.VS_Mindmap (editor) + window.VS_mindmapToSVG (exact renderer for zdiagram). */
(function () {
  const { useState, useRef, useMemo, useCallback, useEffect } = React;
  let _mid = 0; const mid = function () { return 'm' + (++_mid) + Math.random().toString(36).slice(2, 5); };

  const BRANCH = ['#2f8a6b', '#e2792f', '#4f6bd6', '#c2497a', '#9a6bd6', '#c9a227', '#5aaecb', '#d4824f'];
  const NH = 36, ROOTH = 46, VGAP = 12, HGAP = 60;

  function widthOf(label, root) {
    const base = (label ? Array.from(label).length : 2) * 14 + (root ? 40 : 26);
    return Math.max(root ? 96 : 62, base);
  }

  // topics: [{id,label,parent}] with one root (parent null) → positioned graph
  function layout(topics, rootId) {
    const byId = {}; topics.forEach(function (tp) { byId[tp.id] = tp; });
    const childMap = {}; topics.forEach(function (tp) { if (tp.parent) (childMap[tp.parent] = childMap[tp.parent] || []).push(tp.id); });
    const pos = {};
    topics.forEach(function (tp) { pos[tp.id] = { id: tp.id, label: tp.label, w: widthOf(tp.label, tp.id === rootId), h: tp.id === rootId ? ROOTH : NH, isRoot: tp.id === rootId }; });
    function extent(id) { const ch = childMap[id] || []; if (!ch.length) return pos[id].h + VGAP; return ch.reduce(function (s, c) { return s + extent(c); }, 0); }
    function place(id, x, yc, dir, color) {
      const p = pos[id]; p.x = dir > 0 ? x : x - p.w; p.y = yc - p.h / 2; p.bcolor = color;
      const ch = childMap[id] || []; const total = ch.reduce(function (s, c) { return s + extent(c); }, 0);
      let y = yc - total / 2;
      ch.forEach(function (c) { const ec = extent(c); place(c, dir > 0 ? (p.x + p.w + HGAP) : (p.x - HGAP), y + ec / 2, dir, color); y += ec; });
    }
    const root = pos[rootId]; root.x = -root.w / 2; root.y = -root.h / 2; root.bcolor = null;
    const tops = childMap[rootId] || [];
    const rightT = [], leftT = []; tops.forEach(function (id, i) { (i % 2 === 0 ? rightT : leftT).push(id); });
    let rt = rightT.reduce(function (s, c) { return s + extent(c); }, 0), ry = -rt / 2;
    rightT.forEach(function (c, i) { const ec = extent(c); place(c, root.x + root.w + HGAP, ry + ec / 2, 1, BRANCH[tops.indexOf(c) % BRANCH.length]); ry += ec; });
    let lt = leftT.reduce(function (s, c) { return s + extent(c); }, 0), ly = -lt / 2;
    leftT.forEach(function (c) { const ec = extent(c); place(c, root.x - HGAP, ly + ec / 2, -1, BRANCH[tops.indexOf(c) % BRANCH.length]); ly += ec; });
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    topics.forEach(function (tp) { const p = pos[tp.id]; minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h); });
    const M = 28;
    topics.forEach(function (tp) { const p = pos[tp.id]; p.x = Math.round(p.x - minX + M); p.y = Math.round(p.y - minY + M); });
    const nodes = topics.map(function (tp) { return pos[tp.id]; });
    const edges = []; topics.forEach(function (tp) { if (tp.parent) edges.push({ from: tp.parent, to: tp.id }); });
    return { nodes: nodes, edges: edges, root: rootId, w: Math.round(maxX - minX + M * 2), h: Math.round(maxY - minY + M * 2) };
  }

  function mmPath(p, c) {
    const right = (c.x + c.w / 2) >= (p.x + p.w / 2);
    const sx = right ? p.x + p.w : p.x, sy = p.y + p.h / 2;
    const ex = right ? c.x : c.x + c.w, ey = c.y + c.h / 2;
    const mx = (sx + ex) / 2;
    return 'M' + sx + ',' + sy + ' C' + mx + ',' + sy + ' ' + mx + ',' + ey + ' ' + ex + ',' + ey;
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // exact SVG renderer (used by graphToSVG for zdiagram). g = positioned {nodes,edges,root,w,h}
  window.VS_mindmapToSVG = function (g, t) {
    const nodes = g.nodes || []; if (!nodes.length) return '';
    const byId = {}; nodes.forEach(function (n) { byId[n.id] = n; });
    let W = g.w, H = g.h;
    if (!W || !H) { let mx = 0, my = 0; nodes.forEach(function (n) { mx = Math.max(mx, n.x + n.w); my = Math.max(my, n.y + n.h); }); W = mx + 28; H = my + 28; }
    let body = '';
    (g.edges || []).forEach(function (e) { const a = byId[e.from], b = byId[e.to]; if (!a || !b) return; body += '<path d="' + mmPath(a, b) + '" fill="none" stroke="' + (b.bcolor || t.muted) + '" stroke-width="2.4" stroke-linecap="round"/>'; });
    nodes.forEach(function (n) {
      const isRoot = n.isRoot;
      const fill = isRoot ? t.accent : t.surface;
      const stroke = isRoot ? t.accent : (n.bcolor || t.borderStrong);
      const tc = isRoot ? (t.accentText || '#fff') : t.text;
      body += '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="' + (n.h / 2) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (isRoot ? 2 : 2) + '"/>';
      body += '<text x="' + (n.x + n.w / 2) + '" y="' + (n.y + n.h / 2) + '" text-anchor="middle" dominant-baseline="central" font-size="' + (isRoot ? 14 : 12.5) + '" font-weight="' + (isRoot ? 700 : 600) + '" fill="' + tc + '">' + esc(n.label) + '</text>';
    });
    const ff = (t.fontUI || 'sans-serif').replace(/"/g, '');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + ff + '"><rect width="' + W + '" height="' + H + '" fill="' + t.surface + '"/>' + body + '</svg>';
  };

  function seedTopics() {
    const r = mid(), a = mid(), b = mid(), c = mid(), d = mid();
    return { rootId: r, topics: [
      { id: r, label: '中心主题', parent: null },
      { id: a, label: '分支一', parent: r }, { id: b, label: '分支二', parent: r },
      { id: c, label: '分支三', parent: r }, { id: d, label: '子主题', parent: a },
    ] };
  }

  function VS_Mindmap(props) {
    const { t, onMermaid, onGraph, onSVG, initialGraph } = props;
    const init = useRef(null);
    if (!init.current) {
      if (initialGraph && initialGraph.nodes && initialGraph.nodes.length) {
        const pmap = {}; (initialGraph.edges || []).forEach(function (e) { pmap[e.to] = e.from; });
        init.current = { rootId: initialGraph.root || (initialGraph.nodes.find(function (n) { return !pmap[n.id]; }) || initialGraph.nodes[0]).id,
          topics: initialGraph.nodes.map(function (n) { return { id: n.id, label: n.label, parent: pmap[n.id] || null }; }) };
      } else init.current = seedTopics();
    }
    const [topics, setTopics] = useState(init.current.topics);
    const rootId = init.current.rootId;
    const [sel, setSel] = useState(rootId);
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState('');
    const scrollRef = useRef(null);

    const laid = useMemo(function () { return layout(topics, rootId); }, [topics]);
    const posById = {}; laid.nodes.forEach(function (n) { posById[n.id] = n; });

    useEffect(function () {
      const g = { kind: 'mindmap', nodes: laid.nodes, edges: laid.edges, root: rootId, w: laid.w, h: laid.h };
      if (onGraph) onGraph(g);
      if (onSVG) onSVG(window.VS_mindmapToSVG(g, t));
      if (onMermaid) {
        const childMap = {}; laid.edges.forEach(function (e) { (childMap[e.from] = childMap[e.from] || []).push(e.to); });
        const lbl = {}; topics.forEach(function (tp) { lbl[tp.id] = tp.label; });
        let out = 'mindmap\n';
        (function walk(id, d) { out += '  '.repeat(d + 1) + (d === 0 ? 'root((' + lbl[id] + '))' : lbl[id]) + '\n'; (childMap[id] || []).forEach(function (c) { walk(c, d + 1); }); })(rootId, 0);
        onMermaid(out.trim());
      }
    }, [laid]);

    const addChild = useCallback(function (pid) {
      const id = mid(); setTopics(function (ts) { return ts.concat([{ id: id, label: '子主题', parent: pid }]); });
      setSel(id); setEditing(id); setDraft('子主题');
    }, []);
    const addSibling = useCallback(function (id) {
      if (id === rootId) return addChild(rootId);
      const tp = topics.find(function (x) { return x.id === id; }); const nid2 = mid();
      setTopics(function (ts) { return ts.concat([{ id: nid2, label: '主题', parent: tp.parent }]); });
      setSel(nid2); setEditing(nid2); setDraft('主题');
    }, [topics, rootId, addChild]);
    const removeTopic = useCallback(function (id) {
      if (id === rootId) return;
      setTopics(function (ts) {
        const kill = {}; kill[id] = 1; let changed = true;
        while (changed) { changed = false; ts.forEach(function (x) { if (x.parent && kill[x.parent] && !kill[x.id]) { kill[x.id] = 1; changed = true; } }); }
        return ts.filter(function (x) { return !kill[x.id]; });
      });
      setSel(rootId);
    }, [rootId]);
    const commit = useCallback(function () {
      if (editing) setTopics(function (ts) { return ts.map(function (x) { return x.id === editing ? Object.assign({}, x, { label: draft.trim() || '主题' }) : x; }); });
      setEditing(null);
    }, [editing, draft]);

    function onKey(e) {
      if (editing) return;
      if (e.key === 'Tab') { e.preventDefault(); addChild(sel); }
      else if (e.key === 'Enter') { e.preventDefault(); addSibling(sel); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeTopic(sel); }
      else if (e.key === 'F2') { const tp = topics.find(function (x) { return x.id === sel; }); if (tp) { setEditing(sel); setDraft(tp.label); } }
    }

    const selNode = posById[sel];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} tabIndex={0} onKeyDown={onKey}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid ' + t.border, background: t.surface2 }}>
          <span style={{ fontSize: 11.5, color: t.faint }}>选中主题后:Tab 加子主题 · Enter 加同级 · 双击改名 · Delete 删除</span>
          <div style={{ flex: 1 }} />
          <button onClick={function () { addChild(sel); }} style={btn(t, true)}>＋ 子主题</button>
          <button onClick={function () { addSibling(sel); }} style={btn(t, false)}>＋ 同级</button>
          <button onClick={function () { removeTopic(sel); }} disabled={sel === rootId} style={Object.assign({}, btn(t, false), { opacity: sel === rootId ? .4 : 1 })}>删除</button>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', position: 'relative', background: t.surface2, backgroundImage: 'radial-gradient(' + t.border + ' 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
          <div style={{ position: 'relative', width: laid.w, height: laid.h, minWidth: '100%', minHeight: '100%' }}>
            <svg width={laid.w} height={laid.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {laid.edges.map(function (e) { const a = posById[e.from], b = posById[e.to]; if (!a || !b) return null; return <path key={e.from + '>' + e.to} d={mmPath(a, b)} fill="none" stroke={b.bcolor || t.muted} strokeWidth="2.4" strokeLinecap="round" />; })}
            </svg>
            {laid.nodes.map(function (n) {
              const on = n.id === sel;
              const isRoot = n.isRoot;
              return (
                <div key={n.id} onPointerDown={function (e) { e.stopPropagation(); setSel(n.id); }} onDoubleClick={function (e) { e.stopPropagation(); const tp = topics.find(function (x) { return x.id === n.id; }); setEditing(n.id); setDraft(tp.label); }}
                  style={{ position: 'absolute', left: n.x, top: n.y, width: n.w, height: n.h, display: 'grid', placeItems: 'center', boxSizing: 'border-box', padding: '0 10px', cursor: 'pointer', userSelect: 'none',
                    background: isRoot ? t.accent : t.surface, color: isRoot ? t.accentText : t.text,
                    border: '2px solid ' + (on ? t.accent : (isRoot ? t.accent : (n.bcolor || t.borderStrong))),
                    borderRadius: n.h / 2, fontSize: isRoot ? 14 : 12.5, fontWeight: isRoot ? 700 : 600,
                    boxShadow: on ? '0 0 0 3px ' + t.accentSoft : t.shadow }}>
                  {editing === n.id
                    ? <input autoFocus value={draft} onChange={function (e) { setDraft(e.target.value); }} onBlur={commit} onPointerDown={function (e) { e.stopPropagation(); }} onKeyDown={function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setEditing(null); }} style={{ width: '94%', border: 'none', outline: 'none', background: 'transparent', textAlign: 'center', color: isRoot ? t.accentText : t.text, fontSize: isRoot ? 14 : 12.5, fontWeight: isRoot ? 700 : 600, fontFamily: t.fontUI }} />
                    : n.label}
                </div>
              );
            })}
          </div>
        </div>
        {selNode && (
          <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, padding: 6, background: t.surface, border: '1px solid ' + t.border, borderRadius: 999, boxShadow: '0 6px 20px rgba(0,0,0,.14)' }}>
            <button onClick={function () { addChild(sel); }} style={btn(t, true)}>Tab · 子主题</button>
            <button onClick={function () { addSibling(sel); }} style={btn(t, false)}>Enter · 同级</button>
          </div>
        )}
      </div>
    );
  }

  function btn(t, primary) { return { border: primary ? 'none' : '1px solid ' + t.border, background: primary ? t.accent : t.surface, color: primary ? t.accentText : t.muted, cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontSize: 12, fontWeight: primary ? 700 : 600, fontFamily: t.fontUI }; }

  window.VS_Mindmap = VS_Mindmap;
})();
