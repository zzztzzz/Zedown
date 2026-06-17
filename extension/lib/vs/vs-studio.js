/* vs-studio.js — Visual Diagram Studio shell. Vanilla DOM port of the design/v2
   prototype (VisualStudio.jsx). A modal with a 7-type rail; each type is a fully
   visual editor (drag canvas or structured form) — no hand-written mermaid.

   On insert: canvas kinds (flowchart/state/mindmap/class) emit a ```zdiagram
   block (graph JSON, rendered 1:1 by vs-render.js); form kinds (sequence/pie/
   gantt) emit a bare mermaid string and the host wraps it in a ```mermaid fence.

   window.VisualStudio({ t, themeId, initialKind, initialGraph, onClose, onInsert })
     → the modal element (already appended by the caller, or append it yourself). */
(function () {
  var el = window.VS_el;

  var KINDS = [
    { id: 'flowchart', label: '流程图', glyph: '⬚', group: 'canvas' },
    { id: 'state', label: '状态图', glyph: '◉', group: 'canvas' },
    { id: 'mindmap', label: '思维导图', glyph: '✸', group: 'canvas' },
    { id: 'class', label: '类图', glyph: '▣', group: 'canvas' },
    { id: 'sequence', label: '时序图', glyph: '⇄', group: 'form' },
    { id: 'pie', label: '饼图', glyph: '◐', group: 'form' },
    { id: 'gantt', label: '甘特图', glyph: '▤', group: 'form' },
  ];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  function VisualStudio(props) {
    var t = props.t, themeId = props.themeId;
    var kind = props.initialKind || 'flowchart';
    var switched = false;
    var code = '', svgStr = '', graph = null;
    var curEditor = null;     // { el, destroy }
    var seqTimer = null, seqSeq = 0;

    function curKind() { return KINDS.find(function (k) { return k.id === kind; }); }

    function doInsert() {
      var cur = curKind();
      if (cur.group === 'canvas' && graph) { props.onInsert('```zdiagram\n' + JSON.stringify(graph) + '\n```'); props.onClose(); }
      else if (code) { props.onInsert(code); props.onClose(); }
    }

    // ── editor area ──
    var editorArea = el('div', { style: { flex: '1', minWidth: '0', position: 'relative' } });

    function teardownEditor() {
      if (curEditor && typeof curEditor.destroy === 'function') { try { curEditor.destroy(); } catch (e) { /* noop */ } }
      curEditor = null;
      editorArea.textContent = '';
      if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; }
    }

    function onGraph(g) { graph = g; }
    function onSVG(s) { svgStr = s; }
    function onMermaid(s) { code = s; }

    function buildEditor() {
      teardownEditor();
      code = ''; svgStr = ''; graph = null;
      var cur = curKind();
      var ig = (!switched && props.initialGraph) ? props.initialGraph : null;
      var fi = (!switched && props.initialForm && props.initialForm.kind === kind) ? props.initialForm : null;

      if (kind === 'mindmap') {
        curEditor = window.VS_Mindmap({ t: t, initialGraph: ig, onGraph: onGraph, onMermaid: onMermaid, onSVG: onSVG });
        editorArea.appendChild(curEditor.el);
      } else if (cur.group === 'canvas') {
        curEditor = window.VS_GraphEditor({ t: t, kind: kind, initialGraph: ig, onGraph: onGraph, onMermaid: onMermaid, onSVG: onSVG });
        editorArea.appendChild(curEditor.el);
      } else if (kind === 'sequence') {
        var prevPane = el('div', { style: { width: '320px', flexShrink: '0', borderLeft: '1px solid ' + t.border, background: t.surface2, padding: '18px', overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' } },
          el('div', { style: { fontSize: '10.5px', fontWeight: '700', letterSpacing: '.08em', textTransform: 'uppercase', color: t.faint, alignSelf: 'flex-start', marginBottom: '12px' } }, '实时预览'));
        var prevHost = el('div', { style: { width: '100%' } });
        prevPane.appendChild(prevHost);
        var seqOnMermaid = function (s) { code = s; renderSeqPreview(prevHost, s); };
        curEditor = window.VS_Sequence({ t: t, initial: fi, onMermaid: seqOnMermaid });
        editorArea.appendChild(el('div', { style: { display: 'flex', height: '100%' } },
          el('div', { style: { flex: '1', minWidth: '0' } }, curEditor.el), prevPane));
      } else if (kind === 'pie') {
        curEditor = window.VS_Pie({ t: t, initial: fi, onMermaid: onMermaid });
        editorArea.appendChild(curEditor.el);
      } else if (kind === 'gantt') {
        curEditor = window.VS_Gantt({ t: t, initial: fi, onMermaid: onMermaid });
        editorArea.appendChild(curEditor.el);
      }
    }

    // Debounced live preview: render the emitted mermaid to SVG via the bundled
    // mermaid (initialized to match the active theme), and on failure show the
    // error text in red — matching the prototype's SeqPreview behavior.
    function renderSeqPreview(host, codeStr) {
      if (seqTimer) clearTimeout(seqTimer);
      seqTimer = setTimeout(function () {
        if (!codeStr) { host.textContent = ''; return; }
        var m = window.mermaid;
        if (!m || typeof m.render !== 'function') { host.textContent = ''; return; }
        var showErr = function (err) {
          host.textContent = '';
          host.appendChild(el('div', { style: { fontSize: '11.5px', color: 'oklch(0.55 0.18 25)', fontFamily: t.fontMono } }, (err && err.message) ? err.message : String(err)));
        };
        var id = 'vs-seq-' + (++seqSeq);
        var cleanup = function () { var o = document.getElementById('d' + id) || document.getElementById(id); if (o && o.parentElement === document.body) o.remove(); };
        try { m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: themeId === 'midnight' ? 'dark' : 'default' }); } catch (e) { /* noop */ }
        try {
          var out = m.render(id, codeStr);
          if (out && typeof out.then === 'function') {
            out.then(function (r) { host.innerHTML = (r && r.svg) ? r.svg : (typeof r === 'string' ? r : ''); cleanup(); }, function (err) { cleanup(); showErr(err); });
          } else if (typeof out === 'string') { host.innerHTML = out; }
        } catch (err) { cleanup(); showErr(err); }
      }, 200);
    }

    // ── type rail ──
    var railHost = el('div', { style: { width: '132px', flexShrink: '0', borderRight: '1px solid ' + t.border, background: t.surface2, padding: '8px', overflow: 'auto' } });
    function buildRail() {
      railHost.textContent = '';
      KINDS.forEach(function (k) {
        var on = k.id === kind;
        var b = el('button', { onclick: function () { if (k.id === kind) return; kind = k.id; switched = true; buildRail(); buildEditor(); }, style: { display: 'flex', alignItems: 'center', gap: '9px', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', borderRadius: (t.radius - 2) + 'px', padding: '9px 10px', marginBottom: '2px', background: on ? t.surface : 'transparent', boxShadow: on ? t.shadow : 'none', color: on ? t.text : t.muted, fontFamily: t.fontUI, fontSize: '13px', fontWeight: on ? '700' : '500' } },
          el('span', { style: { width: '22px', height: '22px', flexShrink: '0', display: 'grid', placeItems: 'center', borderRadius: '6px', background: on ? t.accent : t.surface, color: on ? t.accentText : t.muted, fontSize: '13px' } }, k.glyph),
          k.label);
        railHost.appendChild(b);
      });
    }

    // ── header ──
    var insertBtn = el('button', { onclick: doInsert, style: { border: 'none', background: t.accent, color: t.accentText, cursor: 'pointer', borderRadius: (t.radius - 2) + 'px', padding: '8px 15px', fontSize: '12.5px', fontWeight: '700', fontFamily: t.fontUI } }, '插入到笔记 ↵');
    var closeBtn = el('button', { onclick: function () { props.onClose(); }, style: { width: '30px', height: '30px', border: 'none', background: 'transparent', color: t.muted, cursor: 'pointer', fontSize: '18px', borderRadius: '6px' } }, '✕');
    var header = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid ' + t.border } },
      el('span', { style: { fontSize: '15px' } }, '✏️'),
      el('span', { style: { fontSize: '14.5px', fontWeight: '700' } }, '可视化图表'),
      el('span', { style: { fontSize: '11px', color: t.faint } }, '拖拽 / 填写即可,无需手写代码'),
      el('div', { style: { flex: '1' } }), insertBtn, closeBtn);

    var panel = el('div', { style: { width: 'min(960px, 95%)', height: 'min(640px, 92%)', display: 'flex', flexDirection: 'column', background: t.surface, color: t.text, borderRadius: (t.radius + 4) + 'px', border: '1px solid ' + t.border, boxShadow: '0 30px 90px rgba(0,0,0,.42)', overflow: 'hidden', fontFamily: t.fontUI } },
      header,
      el('div', { style: { flex: '1', minHeight: '0', display: 'flex' } }, railHost, editorArea));
    panel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

    var backdrop = el('div', { style: { position: 'absolute', inset: '0', zIndex: '70', display: 'grid', placeItems: 'center', background: 'rgba(10,10,12,.42)', backdropFilter: 'blur(2px)' } }, panel);
    backdrop.addEventListener('pointerdown', function () { props.onClose(); });

    function onKey(e) { if (e.key === 'Escape') props.onClose(); }
    window.addEventListener('keydown', onKey);
    backdrop._destroy = function () { window.removeEventListener('keydown', onKey); teardownEditor(); };

    buildRail();
    buildEditor();
    return backdrop;
  }

  window.VisualStudio = VisualStudio;
})();
