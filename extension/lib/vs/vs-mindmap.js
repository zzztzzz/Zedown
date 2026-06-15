/* vs-mindmap.js — vanilla XMind-style mindmap editor. Vanilla DOM port of the
   design/v2 prototype (VisualStudioMindmap.jsx). Auto-laid-out, balanced
   left/right branches with curved coloured connectors. Tab = add child,
   Enter = add sibling, Delete = remove subtree, double-click = rename.
   Layout + exact SVG come from vs-render.js (VS_mindmapLayout / VS_mindmapToSVG).

   window.VS_Mindmap({ t, initialGraph, onGraph, onMermaid, onSVG })
     → { el, destroy } */
(function () {
  var el = window.VS_el, svg = window.VS_svg;
  var seq = 0;
  function mid() { return 'm' + (++seq) + Math.random().toString(36).slice(2, 5); }

  function btnStyle(t, primary) {
    return { border: primary ? 'none' : '1px solid ' + t.border, background: primary ? t.accent : t.surface, color: primary ? t.accentText : t.muted, cursor: 'pointer', borderRadius: '999px', padding: '6px 13px', fontSize: '12px', fontWeight: primary ? '700' : '600', fontFamily: t.fontUI };
  }

  function seedTopics() {
    var r = mid(), a = mid(), b = mid(), c = mid(), d = mid();
    return { rootId: r, topics: [
      { id: r, label: '中心主题', parent: null },
      { id: a, label: '分支一', parent: r }, { id: b, label: '分支二', parent: r },
      { id: c, label: '分支三', parent: r }, { id: d, label: '子主题', parent: a },
    ] };
  }

  function fromGraph(g) {
    var pmap = {}; (g.edges || []).forEach(function (e) { pmap[e.to] = e.from; });
    var rootId = g.root || (g.nodes.find(function (n) { return !pmap[n.id]; }) || g.nodes[0]).id;
    return { rootId: rootId, topics: g.nodes.map(function (n) { return { id: n.id, label: n.label, parent: pmap[n.id] || null }; }) };
  }

  function VS_Mindmap(opts) {
    var t = opts.t;
    var init = (opts.initialGraph && opts.initialGraph.nodes && opts.initialGraph.nodes.length) ? fromGraph(opts.initialGraph) : seedTopics();
    var topics = init.topics, rootId = init.rootId;
    var sel = rootId, editing = null;
    var laid = null, posById = {};

    var scrollEl = el('div', { style: { flex: '1', overflow: 'auto', position: 'relative', background: t.surface2, backgroundImage: 'radial-gradient(' + t.border + ' 1px, transparent 1px)', backgroundSize: '22px 22px' } });
    var bar = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderBottom: '1px solid ' + t.border, background: t.surface2 } },
      el('span', { style: { fontSize: '11.5px', color: t.faint } }, '选中主题后:Tab 加子主题 · Enter 加同级 · 双击改名 · Delete 删除'),
      el('div', { style: { flex: '1' } }),
      el('button', { onclick: function () { addChild(sel); }, style: btnStyle(t, true) }, '＋ 子主题'),
      el('button', { onclick: function () { addSibling(sel); }, style: btnStyle(t, false) }, '＋ 同级'));
    var delBtn = el('button', { onclick: function () { removeTopic(sel); }, style: Object.assign({}, btnStyle(t, false), { opacity: sel === rootId ? '.4' : '1' }) }, '删除');
    bar.appendChild(delBtn);

    var root = el('div', { tabindex: '0', style: { display: 'flex', flexDirection: 'column', height: '100%', outline: 'none' } }, bar, scrollEl);
    root.addEventListener('keydown', onKey);

    function topicById(id) { return topics.find(function (x) { return x.id === id; }); }

    function addChild(pid) { var id = mid(); topics.push({ id: id, label: '子主题', parent: pid }); sel = id; editing = id; paint(); }
    function addSibling(id) {
      if (id === rootId) return addChild(rootId);
      var tp = topicById(id); var n = mid(); topics.push({ id: n, label: '主题', parent: tp.parent }); sel = n; editing = n; paint();
    }
    function removeTopic(id) {
      if (id === rootId) return;
      var kill = {}; kill[id] = 1; var changed = true;
      while (changed) { changed = false; topics.forEach(function (x) { if (x.parent && kill[x.parent] && !kill[x.id]) { kill[x.id] = 1; changed = true; } }); }
      topics = topics.filter(function (x) { return !kill[x.id]; });
      sel = rootId; paint();
    }
    function commit(value) { var tp = topicById(editing); if (tp) tp.label = value.trim() || '主题'; editing = null; paint(); }

    function onKey(e) {
      if (editing) return;
      if (e.key === 'Tab') { e.preventDefault(); addChild(sel); }
      else if (e.key === 'Enter') { e.preventDefault(); addSibling(sel); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeTopic(sel); }
      else if (e.key === 'F2') { var tp = topicById(sel); if (tp) { editing = sel; paint(); } }
    }

    function emit() {
      var g = { kind: 'mindmap', nodes: laid.nodes, edges: laid.edges, root: rootId, w: laid.w, h: laid.h };
      if (opts.onGraph) opts.onGraph(g);
      if (opts.onSVG) opts.onSVG(window.VS_mindmapToSVG(g, t));
      if (opts.onMermaid) {
        var childMap = {}; laid.edges.forEach(function (e) { (childMap[e.from] = childMap[e.from] || []).push(e.to); });
        var lbl = {}; topics.forEach(function (tp) { lbl[tp.id] = tp.label; });
        var out = 'mindmap\n';
        (function walk(id, d) { out += '  '.repeat(d + 1) + (d === 0 ? 'root((' + lbl[id] + '))' : lbl[id]) + '\n'; (childMap[id] || []).forEach(function (c) { walk(c, d + 1); }); })(rootId, 0);
        opts.onMermaid(out.trim());
      }
    }

    function paint() {
      laid = window.VS_mindmapLayout(topics, rootId);
      posById = {}; laid.nodes.forEach(function (n) { posById[n.id] = n; });
      delBtn.style.opacity = sel === rootId ? '.4' : '1';
      delBtn.disabled = sel === rootId;

      scrollEl.textContent = '';
      var inner = el('div', { style: { position: 'relative', width: laid.w + 'px', height: laid.h + 'px', minWidth: '100%', minHeight: '100%' } });
      var layer = svg('svg', { width: laid.w, height: laid.h, style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
      laid.edges.forEach(function (e) { var a = posById[e.from], b = posById[e.to]; if (!a || !b) return; layer.appendChild(svg('path', { d: window.VS_mindmapPath(a, b), fill: 'none', stroke: b.bcolor || t.muted, 'stroke-width': '2.4', 'stroke-linecap': 'round' })); });
      inner.appendChild(layer);

      laid.nodes.forEach(function (n) {
        var on = n.id === sel, isRoot = n.isRoot;
        var node = el('div', { style: { position: 'absolute', left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: n.h + 'px', display: 'grid', placeItems: 'center', boxSizing: 'border-box', padding: '0 10px', cursor: 'pointer', userSelect: 'none', background: isRoot ? t.accent : t.surface, color: isRoot ? t.accentText : t.text, border: '2px solid ' + (on ? t.accent : (isRoot ? t.accent : (n.bcolor || t.borderStrong))), borderRadius: (n.h / 2) + 'px', fontSize: (isRoot ? 14 : 12.5) + 'px', fontWeight: isRoot ? '700' : '600', boxShadow: on ? '0 0 0 3px ' + t.accentSoft : t.shadow } });
        node.addEventListener('pointerdown', function (e) { e.stopPropagation(); sel = n.id; if (editing !== n.id) { editing = null; paint(); root.focus(); } });
        node.addEventListener('dblclick', function (e) { e.stopPropagation(); editing = n.id; paint(); });
        if (editing === n.id) {
          var tp = topicById(n.id);
          var inp = el('input', { value: tp ? tp.label : '', style: { width: '94%', border: 'none', outline: 'none', background: 'transparent', textAlign: 'center', color: isRoot ? t.accentText : t.text, fontSize: (isRoot ? 14 : 12.5) + 'px', fontWeight: isRoot ? '700' : '600', fontFamily: t.fontUI } });
          inp.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
          inp.addEventListener('blur', function () { commit(inp.value); });
          inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(inp.value); } if (e.key === 'Escape') { editing = null; paint(); } });
          node.appendChild(inp);
          setTimeout(function () { inp.focus(); inp.select(); }, 0);
        } else { node.textContent = n.label; }
        inner.appendChild(node);
      });
      scrollEl.appendChild(inner);
      emit();
    }

    function destroy() { root.removeEventListener('keydown', onKey); }

    paint();
    setTimeout(function () { root.focus(); }, 0);
    return { el: root, destroy: destroy };
  }

  window.VS_Mindmap = VS_Mindmap;
})();
