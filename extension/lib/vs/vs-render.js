/* vs-render.js — pure, framework-free renderers for the Visual Diagram Studio.
   Turns a stored graph JSON ({kind,nodes,edges,...}) into an EXACT standalone
   SVG so a ```zdiagram block renders 1:1 with the canvas it was drawn on (no
   mermaid auto-layout). Shared by both the rendering pipeline (enhance.js) and
   the studio's live editors (vs-graph.js / vs-mindmap.js).

   Exposes on window:
     VS_graphToSVG(graph, t)      flowchart / state / class / mindmap → SVG string
     VS_mindmapToSVG(graph, t)    positioned mindmap → SVG string
     VS_mindmapLayout(topics,id)  [{id,label,parent}] → {nodes,edges,root,w,h}
     VS_SHAPES                    flowchart shape catalog (+ mermaid wrap fns)
     VS_shapeMarkup(shape,w,h,fill,stroke,sw)   one node's inner SVG markup
     VS_miniShapeMarkup(id,color)               24×17 rail-icon SVG markup
     VS_classHeight(node)         class-box height from member count
   No DOM, no theme side effects — every color comes from the passed token `t`. */
(function () {
  function svgEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── flowchart shape catalog (also drives mermaid export) ──────────────────
  var SHAPES = [
    { id: 'rect', label: '处理', hint: '处理 / 过程 · Process', wrap: function (x) { return '["' + x + '"]'; } },
    { id: 'round', label: '起止', hint: '起止 / 端点 · Terminator', wrap: function (x) { return '(["' + x + '"])'; } },
    { id: 'circle', label: '连接', hint: '连接点 · Connector', wrap: function (x) { return '(("' + x + '"))'; } },
    { id: 'diamond', label: '判断', hint: '判断 / 决策 · Decision', wrap: function (x) { return '{"' + x + '"}'; } },
    { id: 'para', label: '数据', hint: '数据 / 输入输出 · Data (I/O)', wrap: function (x) { return '[/"' + x + '"/]'; } },
    { id: 'hex', label: '准备', hint: '准备 · Preparation', wrap: function (x) { return '{{"' + x + '"}}'; } },
    { id: 'sub', label: '子流程', hint: '子流程 / 预定义过程 · Predefined', wrap: function (x) { return '[["' + x + '"]]'; } },
    { id: 'db', label: '存储', hint: '数据库 / 存储 · Database', wrap: function (x) { return '[("' + x + '")]'; } },
  ];

  // Inner SVG markup for one node shape, drawn into a w×h box.
  function shapeMarkup(shape, w, h, fill, stroke, sw) {
    var c = 'fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linejoin="round"';
    if (shape === 'start') return '<circle cx="' + w / 2 + '" cy="' + h / 2 + '" r="' + (Math.min(w, h) / 2 - sw) + '" fill="' + stroke + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    if (shape === 'final') return '<circle cx="' + w / 2 + '" cy="' + h / 2 + '" r="' + (Math.min(w, h) / 2 - sw) + '" ' + c + '/><circle cx="' + w / 2 + '" cy="' + h / 2 + '" r="' + (Math.min(w, h) / 2 - sw - 4) + '" fill="' + stroke + '"/>';
    if (shape === 'circle') return '<ellipse cx="' + w / 2 + '" cy="' + h / 2 + '" rx="' + (w / 2 - sw) + '" ry="' + (h / 2 - sw) + '" ' + c + '/>';
    if (shape === 'round') return '<rect x="' + sw + '" y="' + sw + '" width="' + (w - 2 * sw) + '" height="' + (h - 2 * sw) + '" rx="' + ((h - 2 * sw) / 2) + '" ' + c + '/>';
    if (shape === 'diamond') return '<polygon points="' + [w / 2 + ',' + sw, (w - sw) + ',' + h / 2, w / 2 + ',' + (h - sw), sw + ',' + h / 2].join(' ') + '" ' + c + '/>';
    if (shape === 'para') return '<polygon points="' + [(16 + sw) + ',' + sw, (w - sw) + ',' + sw, (w - 16 - sw) + ',' + (h - sw), sw + ',' + (h - sw)].join(' ') + '" ' + c + '/>';
    if (shape === 'hex') return '<polygon points="' + [14 + ',' + sw, (w - 14) + ',' + sw, (w - sw) + ',' + h / 2, (w - 14) + ',' + (h - sw), 14 + ',' + (h - sw), sw + ',' + h / 2].join(' ') + '" ' + c + '/>';
    if (shape === 'db') { var lid = '<path d="M' + sw + ',' + (7 + sw) + ' a' + (w / 2 - sw) + ',7 0 0 0 ' + (w - 2 * sw) + ',0" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '"/>'; return '<path d="M' + sw + ',' + (7 + sw) + ' a' + (w / 2 - sw) + ',7 0 0 1 ' + (w - 2 * sw) + ',0 v' + (h - 14 - 2 * sw) + ' a' + (w / 2 - sw) + ',7 0 0 1 -' + (w - 2 * sw) + ',0 z" ' + c + '/>' + lid; }
    var r = '<rect x="' + sw + '" y="' + sw + '" width="' + (w - 2 * sw) + '" height="' + (h - 2 * sw) + '" rx="7" ' + c + '/>';
    if (shape === 'sub') r += '<line x1="8" y1="' + sw + '" x2="8" y2="' + (h - sw) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/><line x1="' + (w - 8) + '" y1="' + sw + '" x2="' + (w - 8) + '" y2="' + (h - sw) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
    return r;
  }

  // 24×17 mini icon for the shape rail (viewBox 0 0 26 17).
  function miniShapeMarkup(id, c) {
    var p = 'fill="none" stroke="' + c + '" stroke-width="1.4" stroke-linejoin="round"';
    if (id === 'start') return '<circle cx="13" cy="8.5" r="5" fill="' + c + '" stroke="' + c + '"/>';
    if (id === 'final') return '<circle cx="13" cy="8.5" r="6" ' + p + '/><circle cx="13" cy="8.5" r="3" fill="' + c + '"/>';
    if (id === 'round') return '<rect x="1" y="3" width="24" height="11" rx="5.5" ' + p + '/>';
    if (id === 'circle') return '<ellipse cx="13" cy="8.5" rx="7" ry="7" ' + p + '/>';
    if (id === 'diamond') return '<polygon points="13,1 25,8.5 13,16 1,8.5" ' + p + '/>';
    if (id === 'para') return '<polygon points="5,3 25,3 21,14 1,14" ' + p + '/>';
    if (id === 'hex') return '<polygon points="6,3 20,3 25,8.5 20,14 6,14 1,8.5" ' + p + '/>';
    if (id === 'sub') return '<rect x="1" y="3" width="24" height="11" rx="1.5" ' + p + '/><line x1="5" y1="3" x2="5" y2="14" stroke="' + c + '" stroke-width="1.4"/><line x1="21" y1="3" x2="21" y2="14" stroke="' + c + '" stroke-width="1.4"/>';
    if (id === 'db') return '<path d="M1,4 v9 a12,3 0 0 0 24,0 v-9" ' + p + '/><ellipse cx="13" cy="4" rx="12" ry="3" ' + p + '/>';
    return '<rect x="1" y="3" width="24" height="11" rx="2" ' + p + '/>';
  }

  function classHeight(n) { return 30 + (n.members ? n.members.length : 0) * 20 + 8; }

  // Clip the center→center line to each node's bounding box edge.
  function gAnchor(a, b, ha, hb) {
    var ax = a.x + a.w / 2, ay = a.y + ha / 2, bx = b.x + b.w / 2, by = b.y + hb / 2;
    function clip(cx, cy, w, h, tx, ty) {
      var hw = w / 2, hh = h / 2, ux = tx - cx, uy = ty - cy;
      if (!ux && !uy) return { x: cx, y: cy };
      var s = Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity);
      return { x: cx + ux * s, y: cy + uy * s };
    }
    return { p1: clip(ax, ay, a.w, ha, bx, by), p2: clip(bx, by, b.w, hb, ax, ay) };
  }

  // build a standalone, exact SVG of a graph {kind,nodes,edges} using theme tokens t
  function graphToSVG(g, t) {
    if (!g) return '';
    if (g.kind === 'mindmap') return mindmapToSVG(g, t);
    var kind = g.kind, nodes = g.nodes || [], edges = g.edges || [];
    if (!nodes.length) return '';
    var hOf = function (n) { return kind === 'class' ? classHeight(n) : n.h; };
    var byId = function (id) { return nodes.find(function (n) { return n.id === id; }); };
    var minX = 1e9, minY = 1e9, maxX = 0, maxY = 0;
    nodes.forEach(function (n) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + hOf(n)); });
    var pad = 24, ox = pad - minX, oy = pad - minY;
    var W = Math.round(maxX - minX + pad * 2), H = Math.round(maxY - minY + pad * 2);
    var noArrow = kind === 'mindmap';
    var body = '';
    edges.forEach(function (e) {
      var a = byId(e.from), b = byId(e.to); if (!a || !b) return;
      var an = gAnchor(a, b, hOf(a), hOf(b));
      body += '<line x1="' + an.p1.x + '" y1="' + an.p1.y + '" x2="' + an.p2.x + '" y2="' + an.p2.y + '" stroke="' + t.muted + '" stroke-width="1.8" ' + (e.dashed ? 'stroke-dasharray="6 5" ' : '') + (noArrow ? '' : 'marker-end="url(#vsa)" ') + '/>';
      if (e.label) { var mx = (an.p1.x + an.p2.x) / 2, my = (an.p1.y + an.p2.y) / 2, lw = e.label.length * 8 + 8; body += '<rect x="' + (mx - lw / 2) + '" y="' + (my - 9) + '" width="' + lw + '" height="18" rx="4" fill="' + t.surface + '" stroke="' + t.border + '"/><text x="' + mx + '" y="' + (my + 4) + '" text-anchor="middle" font-size="11" fill="' + t.muted + '">' + svgEsc(e.label) + '</text>'; }
    });
    nodes.forEach(function (n) {
      var H2 = hOf(n), fill = n.fill || t.surface, stroke = n.stroke || t.borderStrong, tc = n.textColor || t.text;
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
    var ff = (t.fontUI || 'sans-serif').replace(/"/g, '');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + ff + '"><rect width="' + W + '" height="' + H + '" fill="' + t.surface + '"/><defs><marker id="vsa" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,3 L0,6 Z" fill="' + t.muted + '"/></marker></defs><g transform="translate(' + ox + ',' + oy + ')">' + body + '</g></svg>';
  }

  // ── mindmap: layout + exact SVG ───────────────────────────────────────────
  var BRANCH = ['#2f8a6b', '#e2792f', '#4f6bd6', '#c2497a', '#9a6bd6', '#c9a227', '#5aaecb', '#d4824f'];
  var NH = 36, ROOTH = 46, VGAP = 12, HGAP = 60;

  function widthOf(label, root) {
    var base = (label ? Array.from(label).length : 2) * 14 + (root ? 40 : 26);
    return Math.max(root ? 96 : 62, base);
  }

  // topics: [{id,label,parent}] with one root (parent null) → positioned graph
  function mindmapLayout(topics, rootId) {
    var childMap = {}; topics.forEach(function (tp) { if (tp.parent) (childMap[tp.parent] = childMap[tp.parent] || []).push(tp.id); });
    var pos = {};
    topics.forEach(function (tp) { pos[tp.id] = { id: tp.id, label: tp.label, w: widthOf(tp.label, tp.id === rootId), h: tp.id === rootId ? ROOTH : NH, isRoot: tp.id === rootId }; });
    function extent(id) { var ch = childMap[id] || []; if (!ch.length) return pos[id].h + VGAP; return ch.reduce(function (s, c) { return s + extent(c); }, 0); }
    function place(id, x, yc, dir, color) {
      var p = pos[id]; p.x = dir > 0 ? x : x - p.w; p.y = yc - p.h / 2; p.bcolor = color;
      var ch = childMap[id] || []; var total = ch.reduce(function (s, c) { return s + extent(c); }, 0);
      var y = yc - total / 2;
      ch.forEach(function (c) { var ec = extent(c); place(c, dir > 0 ? (p.x + p.w + HGAP) : (p.x - HGAP), y + ec / 2, dir, color); y += ec; });
    }
    var root = pos[rootId]; root.x = -root.w / 2; root.y = -root.h / 2; root.bcolor = null;
    var tops = childMap[rootId] || [];
    var rightT = [], leftT = []; tops.forEach(function (id, i) { (i % 2 === 0 ? rightT : leftT).push(id); });
    var ry = -rightT.reduce(function (s, c) { return s + extent(c); }, 0) / 2;
    rightT.forEach(function (c) { var ec = extent(c); place(c, root.x + root.w + HGAP, ry + ec / 2, 1, BRANCH[tops.indexOf(c) % BRANCH.length]); ry += ec; });
    var ly = -leftT.reduce(function (s, c) { return s + extent(c); }, 0) / 2;
    leftT.forEach(function (c) { var ec = extent(c); place(c, root.x - HGAP, ly + ec / 2, -1, BRANCH[tops.indexOf(c) % BRANCH.length]); ly += ec; });
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    topics.forEach(function (tp) { var p = pos[tp.id]; minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x + p.w); maxY = Math.max(maxY, p.y + p.h); });
    var M = 28;
    topics.forEach(function (tp) { var p = pos[tp.id]; p.x = Math.round(p.x - minX + M); p.y = Math.round(p.y - minY + M); });
    var nodes = topics.map(function (tp) { return pos[tp.id]; });
    var edges = []; topics.forEach(function (tp) { if (tp.parent) edges.push({ from: tp.parent, to: tp.id }); });
    return { nodes: nodes, edges: edges, root: rootId, w: Math.round(maxX - minX + M * 2), h: Math.round(maxY - minY + M * 2) };
  }

  function mmPath(p, c) {
    var right = (c.x + c.w / 2) >= (p.x + p.w / 2);
    var sx = right ? p.x + p.w : p.x, sy = p.y + p.h / 2;
    var ex = right ? c.x : c.x + c.w, ey = c.y + c.h / 2;
    var mx = (sx + ex) / 2;
    return 'M' + sx + ',' + sy + ' C' + mx + ',' + sy + ' ' + mx + ',' + ey + ' ' + ex + ',' + ey;
  }

  // exact SVG renderer. g = positioned {nodes,edges,root,w,h}
  function mindmapToSVG(g, t) {
    var nodes = g.nodes || []; if (!nodes.length) return '';
    var byId = {}; nodes.forEach(function (n) { byId[n.id] = n; });
    var W = g.w, H = g.h;
    if (!W || !H) { var mx = 0, my = 0; nodes.forEach(function (n) { mx = Math.max(mx, n.x + n.w); my = Math.max(my, n.y + n.h); }); W = mx + 28; H = my + 28; }
    var body = '';
    (g.edges || []).forEach(function (e) { var a = byId[e.from], b = byId[e.to]; if (!a || !b) return; body += '<path d="' + mmPath(a, b) + '" fill="none" stroke="' + (b.bcolor || t.muted) + '" stroke-width="2.4" stroke-linecap="round"/>'; });
    nodes.forEach(function (n) {
      var isRoot = n.isRoot;
      var fill = isRoot ? t.accent : t.surface;
      var stroke = isRoot ? t.accent : (n.bcolor || t.borderStrong);
      var tc = isRoot ? (t.accentText || '#fff') : t.text;
      body += '<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="' + (n.h / 2) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"/>';
      body += '<text x="' + (n.x + n.w / 2) + '" y="' + (n.y + n.h / 2) + '" text-anchor="middle" dominant-baseline="central" font-size="' + (isRoot ? 14 : 12.5) + '" font-weight="' + (isRoot ? 700 : 600) + '" fill="' + tc + '">' + svgEsc(n.label) + '</text>';
    });
    var ff = (t.fontUI || 'sans-serif').replace(/"/g, '');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + ff + '"><rect width="' + W + '" height="' + H + '" fill="' + t.surface + '"/>' + body + '</svg>';
  }

  // Parse a mermaid string emitted by the form editors back into form state, so
  // a ```mermaid block can be re-opened in the studio and edited visually. Only
  // handles the studio's own deterministic output (sequence / pie / gantt);
  // returns null for anything it doesn't recognize (caller falls back).
  function parseMermaid(code) {
    if (!code) return null;
    var lines = code.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!lines.length) return null;
    var head = lines[0].toLowerCase();

    if (head.indexOf('sequencediagram') === 0) {
      var parts = [], msgs = [];
      lines.slice(1).forEach(function (l) {
        var mp = /^participant\s+(.+)$/i.exec(l);
        if (mp) { parts.push(mp[1].trim().replace(/_/g, ' ')); return; }
        var mm = /^(.+?)(--?>>)(.+?):\s*(.*)$/.exec(l);
        if (mm) msgs.push({ from: mm[1].trim().replace(/_/g, ' '), to: mm[3].trim().replace(/_/g, ' '), text: mm[4].trim(), dashed: mm[2] === '-->>' });
      });
      msgs.forEach(function (m) { if (parts.indexOf(m.from) < 0) parts.push(m.from); if (parts.indexOf(m.to) < 0) parts.push(m.to); });
      if (!parts.length) return null;
      return { kind: 'sequence', parts: parts, msgs: msgs };
    }

    if (head.indexOf('pie') === 0) {
      var title = '', rows = [];
      var tm = /^pie\s+title\s+(.+)$/i.exec(lines[0]); if (tm) title = tm[1].trim();
      lines.slice(1).forEach(function (l) { var rm = /^"(.*)"\s*:\s*([\d.]+)$/.exec(l); if (rm) rows.push({ label: rm[1], value: Number(rm[2]) || 0 }); });
      if (!rows.length) return null;
      return { kind: 'pie', title: title, rows: rows };
    }

    if (head.indexOf('gantt') === 0) {
      var gtitle = '', sections = [], cur = null;
      lines.slice(1).forEach(function (l) {
        var tm2 = /^title\s+(.+)$/i.exec(l); if (tm2) { gtitle = tm2[1].trim(); return; }
        if (/^dateformat/i.test(l)) return;
        var sm = /^section\s+(.+)$/i.exec(l); if (sm) { cur = { name: sm[1].trim(), tasks: [] }; sections.push(cur); return; }
        var tk = /^(.+?)\s*:\s*(.+)$/.exec(l);
        if (tk && cur) {
          var name = tk[1].trim();
          var rest = tk[2].split(',').map(function (s) { return s.trim(); });
          var status = '', start = '', days = 1;
          if (rest[0] === 'done' || rest[0] === 'active') status = rest[0];
          rest.forEach(function (tok) { if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) start = tok; var dm = /^(\d+)d$/.exec(tok); if (dm) days = Number(dm[1]); });
          cur.tasks.push({ name: name, start: start, days: days, status: status });
        }
      });
      if (!sections.length) return null;
      return { kind: 'gantt', title: gtitle, sections: sections };
    }
    return null;
  }

  window.VS_graphToSVG = graphToSVG;
  window.VS_mindmapToSVG = mindmapToSVG;
  window.VS_parseMermaid = parseMermaid;
  window.VS_mindmapLayout = mindmapLayout;
  window.VS_mindmapPath = mmPath;
  window.VS_SHAPES = SHAPES;
  window.VS_shapeMarkup = shapeMarkup;
  window.VS_miniShapeMarkup = miniShapeMarkup;
  window.VS_classHeight = classHeight;
  window.VS_svgEsc = svgEsc;
})();
