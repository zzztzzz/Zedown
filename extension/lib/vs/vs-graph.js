/* vs-graph.js — vanilla drag-canvas editor for the node-graph diagram kinds:
   flowchart / state / class. Vanilla DOM port of the design/v2 React prototype
   (VisualStudioGraph.jsx). Drag a shape from the rail onto the canvas to create
   a node; drag the bottom dot to connect; double-click to rename; three-channel
   colour (fill / border / text) per node; edges get text + solid/dashed.

   window.VS_GraphEditor({ t, kind, initialGraph, onGraph, onMermaid, onSVG })
     → { el, destroy }  — calls the callbacks on every change with the live
       graph {kind,nodes,edges} / mermaid string / exact SVG. */
(function () {
  var el = window.VS_el, svg = window.VS_svg;
  var seq = 0;
  function nid() { return 'g' + (++seq) + Math.random().toString(36).slice(2, 5); }
  var SHAPES = window.VS_SHAPES;
  function shapeWrap(id) { var s = SHAPES.find(function (x) { return x.id === id; }); return s ? s.wrap : SHAPES[0].wrap; }
  function hOf(kind, n) { return kind === 'class' ? window.VS_classHeight(n) : n.h; }

  // preset colour palettes per channel + native picker
  var PRESETS = {
    fill: ['', '#eef1fb', '#f2eefb', '#fbeef2', '#fbf6e6', '#e9f6ee', '#ffffff'],
    stroke: ['', '#7b8fd6', '#9b7bd6', '#d67b9b', '#d6b24f', '#5aa97b', '#555555'],
    text: ['', '#2f3e8c', '#5a3e9c', '#9c3e5a', '#8a6a14', '#1f6a44', '#1a1a1a'],
  };

  function btnStyle(t, primary) {
    return { border: primary ? 'none' : '1px solid ' + t.border, background: primary ? t.accent : t.surface, color: primary ? t.accentText : t.muted, cursor: 'pointer', borderRadius: (t.radius - 2) + 'px', padding: '6px 12px', fontSize: '12px', fontWeight: primary ? '700' : '600', fontFamily: t.fontUI };
  }

  function seed(kind) {
    var a = nid(), b = nid(), c = nid();
    if (kind === 'state') {
      var s0 = nid();
      return { nodes: [
        { id: s0, x: 290, y: 30, w: 38, h: 38, label: '', shape: 'start' },
        { id: a, x: 240, y: 110, w: 120, h: 46, label: '草稿', shape: 'round' },
        { id: b, x: 240, y: 220, w: 120, h: 46, label: '编辑中', shape: 'round' },
        { id: c, x: 240, y: 330, w: 120, h: 46, label: '已保存', shape: 'round' },
      ], edges: [{ from: s0, to: a }, { from: a, to: b, label: '打开' }, { from: b, to: c, label: '保存' }] };
    }
    if (kind === 'class') {
      return { nodes: [
        { id: a, x: 130, y: 70, w: 150, h: 0, label: '笔记', members: ['+string 标题', '+string 正文', '+保存()'], shape: 'rect' },
        { id: b, x: 380, y: 90, w: 150, h: 0, label: '文件夹', members: ['+string 名称'], shape: 'rect' },
      ], edges: [{ from: b, to: a, label: '包含' }] };
    }
    return { nodes: [
      { id: a, x: 250, y: 50, w: 124, h: 48, label: '开始', shape: 'round' },
      { id: b, x: 250, y: 175, w: 124, h: 56, label: '是否通过?', shape: 'diamond' },
      { id: c, x: 250, y: 310, w: 124, h: 48, label: '结束', shape: 'round' },
    ], edges: [{ from: a, to: b }, { from: b, to: c, label: '是' }] };
  }

  function VS_GraphEditor(opts) {
    var t = opts.t, kind = opts.kind;
    var init = (opts.initialGraph && opts.initialGraph.kind === kind && opts.initialGraph.nodes)
      ? { nodes: opts.initialGraph.nodes.slice(), edges: (opts.initialGraph.edges || []).slice() }
      : seed(kind);
    var nodes = init.nodes, edges = init.edges;
    var sel = null;            // {type:'node'|'edge', id}
    var editing = null;        // node id being renamed
    var newShape = 'rect';
    var newStyle = { fill: '', stroke: '', text: '' };
    var drag = null, conn = null, dragNew = null, connPt = null;

    var showShapes = kind === 'flowchart' || kind === 'state';
    var accent = t.accent;

    // ── DOM scaffold ──
    var barsHost = el('div', null);
    var canvas = el('div', {
      style: { flex: '1', position: 'relative', overflow: 'hidden', background: t.surface2, backgroundImage: 'radial-gradient(' + t.border + ' 1px, transparent 1px)', backgroundSize: '22px 22px' },
      onpointerdown: function () { if (editing) return; sel = null; update(); },
    });
    var root = el('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } }, barsHost, canvas);
    var ghostEl = null;

    function nodeById(id) { return nodes.find(function (n) { return n.id === id; }); }
    function selNode() { return sel && sel.type === 'node' ? nodeById(sel.id) : null; }
    function pt(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function nodeAt(p) { for (var i = nodes.length - 1; i >= 0; i--) { var n = nodes[i]; if (p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + hOf(kind, n)) return n; } return null; }

    function anchor(a, b) {
      var ah = hOf(kind, a), bh = hOf(kind, b);
      var ax = a.x + a.w / 2, ay = a.y + ah / 2, bx = b.x + b.w / 2, by = b.y + bh / 2;
      function clip(cx, cy, w, h, tx, ty) { var hw = w / 2, hh = h / 2, ux = tx - cx, uy = ty - cy; if (!ux && !uy) return { x: cx, y: cy }; var s = Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity); return { x: cx + ux * s, y: cy + uy * s }; }
      return { p1: clip(ax, ay, a.w, ah, bx, by), p2: clip(bx, by, b.w, bh, ax, ay) };
    }

    // ── mutations ──
    function makeNode(shape, x, y) {
      var id = nid();
      if (kind === 'class') return { id: id, x: x, y: y, w: 150, h: 0, label: '新类', members: ['+成员'], shape: 'rect' };
      if (kind === 'state' && (shape === 'start' || shape === 'final')) return { id: id, x: x, y: y, w: 38, h: 38, label: '', shape: shape };
      var isFlow = kind === 'flowchart';
      return { id: id, x: x, y: y, w: 124, h: (isFlow && shape === 'diamond') ? 56 : 48,
        label: '节点', shape: isFlow ? shape : 'round',
        fill: isFlow ? newStyle.fill : '', stroke: isFlow ? newStyle.stroke : '', textColor: isFlow ? newStyle.text : '' };
    }
    function addNode() { var n = makeNode(newShape, 80 + Math.random() * 120, 80 + Math.random() * 120); nodes.push(n); sel = { type: 'node', id: n.id }; startEdit(n); }
    function createNodeAt(shape, x, y) { var n = makeNode(shape, Math.max(0, x - 62), Math.max(0, y - 24)); nodes.push(n); sel = { type: 'node', id: n.id }; update(); }
    function removeSel() {
      if (!sel) return;
      if (sel.type === 'node') { nodes = nodes.filter(function (n) { return n.id !== sel.id; }); edges = edges.filter(function (x) { return x.from !== sel.id && x.to !== sel.id; }); }
      else edges = edges.filter(function (x) { return (x.from + '>' + x.to) !== sel.id; });
      sel = null; update();
    }
    function setShape(id, shape) { var n = nodeById(id); if (!n) return; n.shape = shape; if (shape === 'diamond') n.h = Math.max(n.h, 56); update(); }
    function applyStyle(key, val) {
      var sn = selNode();
      if (sn) { sn[key === 'text' ? 'textColor' : key] = val; update(); }
      else { newStyle[key] = val; syncBars(); }
    }
    function toggleDash(eid) { edges.forEach(function (x) { if ((x.from + '>' + x.to) === eid) x.dashed = !x.dashed; }); update(); }
    function labelEdge(eid) { var e = edges.find(function (x) { return (x.from + '>' + x.to) === eid; }); var v = window.prompt('连线文字(可留空):', (e && e.label) || ''); if (v !== null) { e.label = v; update(); } }

    function startEdit(n) {
      editing = n.id;
      update();
    }
    function commitEdit(value) {
      var n = nodeById(editing); editing = null;
      if (n) {
        if (kind === 'class') { var lines = value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); n.label = lines[0] || '类'; n.members = lines.slice(1); }
        else n.label = value.trim() || '节点';
      }
      update();
    }

    // ── pointer interaction ──
    function onMove(e) {
      if (drag) { var p = pt(e); var n = nodeById(drag.id); if (n) { n.x = Math.max(0, p.x - drag.ox); n.y = Math.max(0, p.y - drag.oy); } paintCanvas(); }
      else if (conn) { connPt = pt(e); paintCanvas(); }
      else if (dragNew) { moveGhost(e.clientX, e.clientY); }
    }
    function onUp(e) {
      var changed = false;
      if (conn) {
        var target = nodeAt(pt(e));
        if (target && target.id !== conn.from) {
          var f = conn.from, to = target.id;
          if (!edges.some(function (x) { return x.from === f && x.to === to; })) { edges.push({ from: f, to: to }); changed = true; }
        }
        conn = null; connPt = null; changed = true;
      }
      if (drag) { drag = null; changed = true; }
      if (dragNew) {
        var r = canvas.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) createNodeAt(dragNew.shape, e.clientX - r.left, e.clientY - r.top);
        dragNew = null; removeGhost();
      }
      if (changed) update();
    }
    function onKey(e) {
      if (editing) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);

    function startDrag(e, n) { e.stopPropagation(); if (editing) return; var p = pt(e); drag = { id: n.id, ox: p.x - n.x, oy: p.y - n.y }; sel = { type: 'node', id: n.id }; update(); }
    function startConn(e, n) { e.stopPropagation(); conn = { from: n.id }; connPt = pt(e); }

    // ── ghost (drag-new preview) ──
    function moveGhost(x, y) {
      if (!ghostEl) {
        ghostEl = el('div', { style: { position: 'fixed', width: '80px', height: '36px', pointerEvents: 'none', zIndex: '90', opacity: '.8' } });
        ghostEl.innerHTML = '<svg width="80" height="36" viewBox="0 0 80 36" style="overflow:visible"><g transform="scale(3.05,2.1)">' + window.VS_miniShapeMarkup(dragNew.shape, accent) + '</g></svg>';
        document.body.appendChild(ghostEl);
      }
      ghostEl.style.left = (x - 40) + 'px'; ghostEl.style.top = (y - 18) + 'px';
    }
    function removeGhost() { if (ghostEl && ghostEl.parentNode) ghostEl.parentNode.removeChild(ghostEl); ghostEl = null; }

    // ── painting ──
    function paintCanvas() {
      canvas.textContent = '';
      var sn = selNode();
      // edges + connection-preview layer
      var defs = svg('defs', null,
        svg('marker', { id: 'vs-arrow', markerWidth: '10', markerHeight: '10', refX: '8', refY: '3', orient: 'auto', markerUnits: 'strokeWidth' }, svg('path', { d: 'M0,0 L8,3 L0,6 Z', fill: t.muted })),
        svg('marker', { id: 'vs-arrow-sel', markerWidth: '10', markerHeight: '10', refX: '8', refY: '3', orient: 'auto', markerUnits: 'strokeWidth' }, svg('path', { d: 'M0,0 L8,3 L0,6 Z', fill: accent })));
      var layer = svg('svg', { style: { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' } }, defs);
      edges.forEach(function (e) {
        var a = nodeById(e.from), b = nodeById(e.to); if (!a || !b) return;
        var an = anchor(a, b), eid = e.from + '>' + e.to;
        var on = sel && sel.type === 'edge' && sel.id === eid;
        var mid = { x: (an.p1.x + an.p2.x) / 2, y: (an.p1.y + an.p2.y) / 2 };
        layer.appendChild(svg('line', { x1: an.p1.x, y1: an.p1.y, x2: an.p2.x, y2: an.p2.y, stroke: on ? accent : t.muted, 'stroke-width': on ? 2.5 : 1.8, 'stroke-dasharray': e.dashed ? '6 5' : null, 'marker-end': 'url(#' + (on ? 'vs-arrow-sel' : 'vs-arrow') + ')' }));
        var hit = svg('line', { x1: an.p1.x, y1: an.p1.y, x2: an.p2.x, y2: an.p2.y, stroke: 'transparent', 'stroke-width': '14', style: { pointerEvents: 'stroke', cursor: 'pointer' } });
        hit.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); sel = { type: 'edge', id: eid }; update(); });
        hit.addEventListener('dblclick', function () { labelEdge(eid); });
        layer.appendChild(hit);
        if (e.label) {
          var lw = e.label.length * 8 + 8;
          layer.appendChild(svg('rect', { x: mid.x - lw / 2, y: mid.y - 9, width: lw, height: 18, rx: 4, fill: t.surface, stroke: t.border }));
          layer.appendChild(svg('text', { x: mid.x, y: mid.y + 4, 'text-anchor': 'middle', 'font-size': '11', fill: t.muted, style: { fontFamily: t.fontUI } }, e.label));
        }
      });
      if (connPt && conn) { var ca = nodeById(conn.from); if (ca) layer.appendChild(svg('line', { x1: ca.x + ca.w / 2, y1: ca.y + hOf(kind, ca), x2: connPt.x, y2: connPt.y, stroke: accent, 'stroke-width': '2', 'stroke-dasharray': '5 4', 'marker-end': 'url(#vs-arrow-sel)' })); }
      canvas.appendChild(layer);

      // nodes
      nodes.forEach(function (n) {
        var on = sel && sel.type === 'node' && sel.id === n.id;
        var H = hOf(kind, n);
        var connDot = el('div', { title: '拖我连线', style: { position: 'absolute', bottom: '-7px', left: '50%', marginLeft: '-6px', width: '12px', height: '12px', borderRadius: '50%', background: accent, border: '2px solid ' + t.surface, cursor: 'crosshair', opacity: on ? '1' : '.5' } });
        connDot.addEventListener('pointerdown', function (e) { startConn(e, n); });

        if (kind === 'class') {
          var box = el('div', { style: { position: 'absolute', left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', minHeight: H + 'px', cursor: 'grab', userSelect: 'none', background: t.surface, border: '1.5px solid ' + (on ? accent : t.borderStrong), borderRadius: t.radius + 'px', boxShadow: on ? '0 0 0 3px ' + t.accentSoft : t.shadow, overflow: 'hidden' } });
          box.addEventListener('pointerdown', function (e) { startDrag(e, n); });
          box.addEventListener('dblclick', function (e) { e.stopPropagation(); startEdit(n); });
          if (editing === n.id) {
            var ta = el('textarea', { style: { width: '100%', height: (H + 10) + 'px', border: 'none', outline: 'none', resize: 'none', background: 'transparent', color: t.text, fontSize: '12px', fontFamily: t.fontMono, padding: '8px', boxSizing: 'border-box' } });
            ta.value = [n.label].concat(n.members || []).join('\n');
            ta.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
            ta.addEventListener('blur', function () { commitEdit(ta.value); });
            ta.addEventListener('keydown', function (e) { if (e.key === 'Escape') { editing = null; update(); } });
            box.appendChild(ta);
            setTimeout(function () { ta.focus(); ta.select(); }, 0);
          } else {
            box.appendChild(el('div', { style: { fontWeight: '700', fontSize: '13px', textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid ' + t.border, background: t.surface2, color: n.textColor || t.text } }, n.label));
            var mem = el('div', { style: { padding: '6px 10px' } });
            (n.members || []).forEach(function (m) { mem.appendChild(el('div', { style: { fontSize: '11.5px', fontFamily: t.fontMono, color: t.muted, lineHeight: '1.7' } }, m)); });
            box.appendChild(mem);
          }
          box.appendChild(connDot);
          canvas.appendChild(box);
          return;
        }

        var wrap = el('div', { style: { position: 'absolute', left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: H + 'px', cursor: 'grab', userSelect: 'none' } });
        wrap.addEventListener('pointerdown', function (e) { startDrag(e, n); });
        wrap.addEventListener('dblclick', function (e) { e.stopPropagation(); startEdit(n); });
        var shapeSvg = el('div', { style: { position: 'absolute', inset: '0' } });
        shapeSvg.innerHTML = '<svg width="' + n.w + '" height="' + H + '" style="position:absolute;inset:0;overflow:visible">' + window.VS_shapeMarkup(n.shape, n.w, H, n.fill || t.surface, on ? accent : (n.stroke || t.borderStrong), on ? 2.2 : 1.5) + '</svg>';
        wrap.appendChild(shapeSvg);
        var labelBox = el('div', { style: { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '0 12px', boxSizing: 'border-box', fontSize: '12.5px', fontWeight: '600', color: n.textColor || t.text, pointerEvents: 'none' } });
        if (editing === n.id) {
          var inp = el('input', { value: n.label, style: { width: '86%', border: 'none', outline: 'none', background: 'transparent', textAlign: 'center', color: t.text, fontSize: '12.5px', fontWeight: '600', fontFamily: t.fontUI, pointerEvents: 'auto' } });
          inp.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
          inp.addEventListener('blur', function () { commitEdit(inp.value); });
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commitEdit(inp.value); } if (e.key === 'Escape') { editing = null; update(); } });
          labelBox.appendChild(inp);
          setTimeout(function () { inp.focus(); inp.select(); }, 0);
        } else { labelBox.textContent = n.label; }
        wrap.appendChild(labelBox);
        wrap.appendChild(connDot);
        canvas.appendChild(wrap);
      });
      canvas.style.cursor = drag ? 'grabbing' : 'default';
    }

    // ── toolbars ──
    function colorControl(label, channel, value) {
      var presets = PRESETS[channel] || [];
      var row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } }, el('span', { style: { fontSize: '11.5px', color: t.muted, fontWeight: '600' } }, label));
      presets.forEach(function (c) {
        var on = (value || '') === c;
        var b = el('button', { title: c || '默认', onclick: function () { applyStyle(channel, c); }, style: { width: '19px', height: '19px', cursor: 'pointer', borderRadius: '50%', padding: '0', display: 'grid', placeItems: 'center', background: c || t.surface, border: '2px solid ' + (on ? accent : t.borderStrong), boxShadow: on ? '0 0 0 2px ' + t.accentSoft : 'none' } }, c ? false : el('span', { style: { fontSize: '10px', color: t.faint } }, '⊘'));
        row.appendChild(b);
      });
      var lab = el('label', { title: '自定义(拾色板)', style: { width: '19px', height: '19px', cursor: 'pointer', borderRadius: '50%', overflow: 'hidden', position: 'relative', border: '2px solid ' + t.borderStrong, background: 'conic-gradient(red,orange,yellow,lime,aqua,blue,magenta,red)' } });
      var pick = el('input', { type: 'color', value: (value && value[0] === '#') ? value : '#888888', style: { position: 'absolute', inset: '-4px', width: '30px', height: '30px', border: 'none', padding: '0', opacity: '0', cursor: 'pointer' } });
      pick.addEventListener('input', function (e) { applyStyle(channel, e.target.value); });
      lab.appendChild(pick); row.appendChild(lab);
      return row;
    }

    function syncBars() {
      barsHost.textContent = '';
      var sn = selNode();
      if (showShapes) {
        var palette = kind === 'state' ? [{ id: 'round', label: '状态' }, { id: 'start', label: '起始' }, { id: 'final', label: '结束' }] : SHAPES;
        var rail = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderBottom: '1px solid ' + t.border, background: t.surface2, flexWrap: 'wrap' } }, el('span', { style: { fontSize: '11.5px', color: t.faint, marginRight: '2px' } }, '拖形状到画布 →'));
        palette.forEach(function (s) {
          var on = sn && sn.shape === s.id;
          var b = el('button', { title: (s.hint || s.label) + ' · 拖到画布创建', style: { display: 'flex', alignItems: 'center', gap: '5px', cursor: 'grab', padding: '4px 8px 4px 5px', height: '28px', border: '1px solid ' + (on ? accent : t.border), borderRadius: (t.radius - 3) + 'px', background: on ? t.accentSoft : t.surface, color: on ? accent : t.muted, fontFamily: t.fontUI, fontSize: '11.5px', fontWeight: '600', touchAction: 'none' } });
          b.innerHTML = '<svg width="26" height="17" viewBox="0 0 26 17" style="overflow:visible">' + window.VS_miniShapeMarkup(s.id, on ? accent : t.muted) + '</svg>';
          b.appendChild(document.createTextNode(s.label));
          b.addEventListener('pointerdown', function (e) { e.preventDefault(); dragNew = { shape: s.id }; moveGhost(e.clientX, e.clientY); });
          b.addEventListener('click', function () { if (selNode()) setShape(selNode().id, s.id); else { newShape = s.id; syncBars(); } });
          rail.appendChild(b);
        });
        barsHost.appendChild(rail);

        var colorRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', padding: '7px 14px', borderBottom: '1px solid ' + t.border, background: t.surface2, flexWrap: 'wrap' } }, el('span', { style: { fontSize: '11.5px', color: t.faint } }, sn ? '所选节点:' : '新节点默认:'));
        colorRow.appendChild(colorControl('底色', 'fill', sn ? (sn.fill || '') : newStyle.fill));
        colorRow.appendChild(colorControl('边框', 'stroke', sn ? (sn.stroke || '') : newStyle.stroke));
        colorRow.appendChild(colorControl('文字', 'text', sn ? (sn.textColor || '') : newStyle.text));
        barsHost.appendChild(colorRow);
      }

      var hint = kind === 'class' ? '双击类框编辑:第一行=类名,其余=成员' : '拖动移动 · 拉底部圆点连线 · 双击改名';
      var actions = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 14px', borderBottom: '1px solid ' + t.border, background: t.surface2 } }, el('span', { style: { fontSize: '11.5px', color: t.faint } }, hint), el('div', { style: { flex: '1' } }));
      if (sel && sel.type === 'edge') {
        actions.appendChild(el('button', { onclick: function () { labelEdge(sel.id); }, style: btnStyle(t, false) }, '连线文字'));
        actions.appendChild(el('button', { onclick: function () { toggleDash(sel.id); }, style: btnStyle(t, false) }, '实线/虚线'));
      }
      var delBtn = el('button', { onclick: removeSel, style: Object.assign({}, btnStyle(t, false), { opacity: sel ? '1' : '.4' }) }, '删除');
      if (!sel) delBtn.disabled = true;
      actions.appendChild(delBtn);
      actions.appendChild(el('button', { onclick: addNode, style: btnStyle(t, false) }, '＋ ' + (kind === 'class' ? '添加类' : '添加节点')));
      barsHost.appendChild(actions);
    }

    // ── export / emit ──
    function sanit(s) { return String(s).replace(/"/g, ''); }
    function exportMermaid() {
      var idMap = {}; nodes.forEach(function (n, i) { idMap[n.id] = 'N' + (i + 1); });
      var out = '';
      if (kind === 'flowchart') {
        out = 'flowchart TD\n';
        nodes.forEach(function (n) { out += '  ' + idMap[n.id] + shapeWrap(n.shape)(sanit(n.label)) + '\n'; });
        edges.forEach(function (e) { if (idMap[e.from] && idMap[e.to]) { var link = e.dashed ? (e.label ? '-. ' + sanit(e.label) + ' .->' : '-.->') : (e.label ? '-->|' + sanit(e.label) + '|' : '-->'); out += '  ' + idMap[e.from] + ' ' + link + ' ' + idMap[e.to] + '\n'; } });
        nodes.forEach(function (n) { var parts = []; if (n.fill) parts.push('fill:' + n.fill); if (n.stroke) parts.push('stroke:' + n.stroke); if (n.textColor) parts.push('color:' + n.textColor); if (parts.length) out += '  style ' + idMap[n.id] + ' ' + parts.join(',') + '\n'; });
      } else if (kind === 'state') {
        out = 'stateDiagram-v2\n';
        var tok = function (n) { return (n.shape === 'start' || n.shape === 'final') ? '[*]' : idMap[n.id]; };
        nodes.forEach(function (n) { if (n.shape !== 'start' && n.shape !== 'final') out += '  state "' + sanit(n.label) + '" as ' + idMap[n.id] + '\n'; });
        if (!nodes.some(function (n) { return n.shape === 'start'; })) { var inc = {}; edges.forEach(function (e) { inc[e.to] = 1; }); var rt = nodes.find(function (n) { return n.shape !== 'final' && !inc[n.id]; }); if (rt) out += '  [*] --> ' + idMap[rt.id] + '\n'; }
        edges.forEach(function (e) { var a = nodeById(e.from), b = nodeById(e.to); if (a && b) out += '  ' + tok(a) + ' --> ' + tok(b) + (e.label ? ' : ' + sanit(e.label) : '') + '\n'; });
      } else { // class
        out = 'classDiagram\n';
        nodes.forEach(function (n) { var nm = sanit(n.label).replace(/\s+/g, ''); out += '  class ' + nm + ' {\n'; (n.members || []).forEach(function (m) { out += '    ' + sanit(m) + '\n'; }); out += '  }\n'; });
        edges.forEach(function (e) { var a = nodeById(e.from), b = nodeById(e.to); if (a && b) out += '  ' + sanit(a.label).replace(/\s+/g, '') + ' --> ' + sanit(b.label).replace(/\s+/g, '') + (e.label ? ' : ' + sanit(e.label) : '') + '\n'; });
      }
      return out.trim();
    }
    function curGraph() { return { kind: kind, nodes: nodes, edges: edges }; }
    function emit() {
      if (opts.onGraph) opts.onGraph(curGraph());
      if (opts.onMermaid) opts.onMermaid(exportMermaid());
      if (opts.onSVG) opts.onSVG(window.VS_graphToSVG(curGraph(), t));
    }
    function update() { syncBars(); paintCanvas(); emit(); }

    function destroy() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      removeGhost();
    }

    syncBars(); paintCanvas(); emit();
    return { el: root, destroy: destroy };
  }

  window.VS_GraphEditor = VS_GraphEditor;
})();
