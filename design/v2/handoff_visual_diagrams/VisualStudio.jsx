/* VisualStudio.jsx — visual diagram studio shell. 7 type tabs; each tab is a
   fully visual editor (drag canvas or structured form) — no hand-written mermaid.
   On insert, emits the current mermaid (the studio shell adds nothing; FullEditor
   wraps it in a ```mermaid block).
   window.VisualStudio({ t, onClose, onInsert, initialKind }) */
(function () {
  const { useState, useEffect, useRef } = React;

  const KINDS = [
    { id: 'flowchart', label: '流程图', glyph: '⬚', group: 'canvas' },
    { id: 'state', label: '状态图', glyph: '◉', group: 'canvas' },
    { id: 'mindmap', label: '思维导图', glyph: '✸', group: 'canvas' },
    { id: 'class', label: '类图', glyph: '▣', group: 'canvas' },
    { id: 'sequence', label: '时序图', glyph: '⇄', group: 'form' },
    { id: 'pie', label: '饼图', glyph: '◐', group: 'form' },
    { id: 'gantt', label: '甘特图', glyph: '▤', group: 'form' },
  ];

  function SeqPreview({ t, code, themeId }) {
    const [svg, setSvg] = useState('');
    const [err, setErr] = useState('');
    useEffect(function () {
      let alive = true;
      if (!code || !window.MD_renderMermaid) return;
      setErr('');
      const id = setTimeout(function () {
        window.MD_renderMermaid(code, themeId).then(function (r) {
          if (!alive) return;
          if (r.ok) { setSvg(r.svg); setErr(''); } else { setErr(r.error); }
        });
      }, 200);
      return function () { alive = false; clearTimeout(id); };
    }, [code]);
    return (
      <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid ' + t.border, background: t.surface2, padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: t.faint, alignSelf: 'flex-start', marginBottom: 12 }}>实时预览</div>
        {err
          ? <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.18 25)', fontFamily: t.fontMono }}>{err}</div>
          : <div style={{ width: '100%' }} dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
    );
  }

  function VisualStudio(props) {
    const { t, onClose, onInsert, initialKind, themeId, initialGraph } = props;
    const [kind, setKind] = useState(initialKind || 'flowchart');
    const codeRef = useRef('');
    const svgRef = useRef('');
    const graphRef = useRef(null);
    const [, force] = useState(0);
    const onMermaid = function (str) { codeRef.current = str; force(function (x) { return x + 1; }); };
    const onSVG = function (svg) { svgRef.current = svg; };
    const onGraph = function (g) { graphRef.current = g; };

    function doInsert() {
      if (cur.group === 'canvas' && graphRef.current) {
        onInsert('```zdiagram\n' + JSON.stringify(graphRef.current) + '\n```');
        onClose();
      } else if (codeRef.current) { onInsert(codeRef.current); onClose(); }
    }

    useEffect(function () { function k(e) { if (e.key === 'Escape') onClose(); } window.addEventListener('keydown', k); return function () { window.removeEventListener('keydown', k); }; }, []);

    const cur = KINDS.find(function (k) { return k.id === kind; });
    let editor;
    if (kind === 'mindmap') editor = <window.VS_Mindmap t={t} onMermaid={onMermaid} onGraph={onGraph} onSVG={onSVG} initialGraph={initialGraph} />;
    else if (cur.group === 'canvas') editor = <window.VS_GraphEditor t={t} kind={kind} onMermaid={onMermaid} onSVG={onSVG} onGraph={onGraph} initialGraph={initialGraph} />;
    else if (kind === 'sequence') editor = (
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}><window.VS_Sequence t={t} onMermaid={onMermaid} /></div>
        <SeqPreview t={t} code={codeRef.current} themeId={themeId} />
      </div>
    );
    else if (kind === 'pie') editor = <window.VS_Pie t={t} onMermaid={onMermaid} />;
    else if (kind === 'gantt') editor = <window.VS_Gantt t={t} onMermaid={onMermaid} />;

    return (
      <div onPointerDown={onClose} style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', background: 'rgba(10,10,12,.42)', backdropFilter: 'blur(2px)' }}>
        <div onPointerDown={function (e) { e.stopPropagation(); }} style={{
          width: 'min(960px, 95%)', height: 'min(640px, 92%)', display: 'flex', flexDirection: 'column',
          background: t.surface, color: t.text, borderRadius: t.radius + 4, border: '1px solid ' + t.border,
          boxShadow: '0 30px 90px rgba(0,0,0,.42)', overflow: 'hidden', fontFamily: t.fontUI,
        }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid ' + t.border }}>
            <span style={{ fontSize: 15 }}>✏️</span>
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>可视化图表</span>
            <span style={{ fontSize: 11, color: t.faint }}>拖拽 / 填写即可,无需手写代码</span>
            <div style={{ flex: 1 }} />
            <button onClick={doInsert} style={{ border: 'none', background: t.accent, color: t.accentText, cursor: 'pointer', borderRadius: t.radius - 2, padding: '8px 15px', fontSize: 12.5, fontWeight: 700, fontFamily: t.fontUI }}>插入到笔记 ↵</button>
            <button onClick={onClose} style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: t.muted, cursor: 'pointer', fontSize: 18, borderRadius: 6 }}>✕</button>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {/* type rail */}
            <div style={{ width: 132, flexShrink: 0, borderRight: '1px solid ' + t.border, background: t.surface2, padding: 8, overflow: 'auto' }}>
              {KINDS.map(function (k) {
                const on = k.id === kind;
                return (
                  <button key={k.id} onClick={function () { setKind(k.id); }} style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', cursor: 'pointer',
                    border: 'none', borderRadius: t.radius - 2, padding: '9px 10px', marginBottom: 2,
                    background: on ? t.surface : 'transparent', boxShadow: on ? t.shadow : 'none',
                    color: on ? t.text : t.muted, fontFamily: t.fontUI, fontSize: 13, fontWeight: on ? 700 : 500,
                  }}>
                    <span style={{ width: 22, height: 22, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 6, background: on ? t.accent : t.surface, color: on ? t.accentText : t.muted, fontSize: 13 }}>{k.glyph}</span>
                    {k.label}
                  </button>
                );
              })}
            </div>
            {/* editor */}
            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>{editor}</div>
          </div>
        </div>
      </div>
    );
  }

  window.VisualStudio = VisualStudio;
})();
