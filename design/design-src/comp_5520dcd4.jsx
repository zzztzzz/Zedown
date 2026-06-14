/* SidePanel.jsx — the docked side-panel surface. Self-contained interactive:
   edit/preview toggle, live formatting toolbar, word count.
   Exports window.MDSidePanel. Props: { themeId, height } */
(function () {
  const { useState, useRef, useCallback, useEffect } = React;
  const T = window.MD_TOKENS;

  function Seg({ t, active, onClick, children }) {
    return (
      <button onClick={onClick} style={{
        flex: 1, border: 'none', cursor: 'pointer', fontFamily: t.fontUI,
        fontSize: 12, fontWeight: 600, padding: '6px 0', borderRadius: t.radius - 3,
        color: active ? t.text : t.muted,
        background: active ? t.surface : 'transparent',
        boxShadow: active ? t.shadow : 'none',
        transition: 'all .15s',
      }}>{children}</button>
    );
  }

  function ToolBtn({ t, title, onClick, children }) {
    const [h, setH] = useState(false);
    return (
      <button title={title} onMouseDown={function (e) { e.preventDefault(); }} onClick={onClick}
        onMouseEnter={function () { setH(true); }} onMouseLeave={function () { setH(false); }}
        style={{
          width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: 'pointer',
          border: 'none', borderRadius: 6, background: h ? t.surface2 : 'transparent',
          color: h ? t.text : t.muted, fontFamily: t.fontMono, fontSize: 13, fontWeight: 700,
          transition: 'all .12s',
        }}>{children}</button>
    );
  }

  function MDSidePanel({ themeId = 'paper', height = 560 }) {
    const t = T[themeId];
    const [mode, setMode] = useState('edit');
    const [text, setText] = useState(window.MD_SAMPLE.NOTE);
    const [saved, setSaved] = useState(true);
    const ref = useRef(null);

    useEffect(function () {
      if (saved) return;
      const id = setTimeout(function () { setSaved(true); }, 900);
      return function () { clearTimeout(id); };
    }, [text, saved]);

    const wrap = useCallback(function (pre, post, block) {
      const el = ref.current;
      if (!el) return;
      const s = el.selectionStart, e = el.selectionEnd;
      const sel = text.slice(s, e) || (block ? '列表项' : '文字');
      const next = text.slice(0, s) + pre + sel + (post || '') + text.slice(e);
      setText(next); setSaved(false);
      requestAnimationFrame(function () {
        el.focus();
        el.selectionStart = s + pre.length;
        el.selectionEnd = s + pre.length + sel.length;
      });
    }, [text]);

    const words = (text.trim().match(/[\u4e00-\u9fa5]|\w+/g) || []).length;

    return (
      <div className={'theme-' + themeId} style={{
        width: '100%', height, display: 'flex', flexDirection: 'column',
        background: t.surface2, fontFamily: t.fontUI, color: t.text,
        borderLeft: '1px solid ' + t.borderStrong,
      }}>
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px',
          borderBottom: '1px solid ' + t.border, background: t.surface,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6, background: t.accent, color: t.accentText,
            display: 'grid', placeItems: 'center', fontFamily: t.fontMono, fontWeight: 800, fontSize: 12,
          }}>M</div>
          <span style={{ fontWeight: 700, fontSize: 13, flex: 1, letterSpacing: themeId === 'midnight' ? '.01em' : 0 }}>
            Markdown</span>
          <span style={{ fontSize: 11, color: t.faint }}>速记</span>
          {[0, 1].map(function (k) {
            return <div key={k} style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid ' + t.borderStrong }} />;
          })}
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 3, padding: 7, background: t.surface2 }}>
          <div style={{ display: 'flex', gap: 3, flex: 1, background: t.surface2, padding: 3, borderRadius: t.radius, border: '1px solid ' + t.border }}>
            <Seg t={t} active={mode === 'edit'} onClick={function () { setMode('edit'); }}>编辑</Seg>
            <Seg t={t} active={mode === 'preview'} onClick={function () { setMode('preview'); }}>预览</Seg>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', background: t.surface }}>
          {mode === 'edit' ? (
            <textarea ref={ref} value={text}
              onChange={function (e) { setText(e.target.value); setSaved(false); }}
              spellCheck={false}
              style={{
                width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none',
                background: 'transparent', color: t.text, padding: '14px 15px',
                fontFamily: t.fontMono, fontSize: 12.5, lineHeight: 1.7, boxSizing: 'border-box',
              }} />
          ) : (
            <div className="prose" style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '16px 16px 28px' }}
              dangerouslySetInnerHTML={{ __html: window.mdToHtml(text) }} />
          )}
        </div>

        {/* toolbar */}
        {mode === 'edit' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px',
            borderTop: '1px solid ' + t.border, background: t.surface2,
          }}>
            <ToolBtn t={t} title="加粗" onClick={function () { wrap('**', '**'); }}>B</ToolBtn>
            <ToolBtn t={t} title="斜体" onClick={function () { wrap('*', '*'); }}><span style={{ fontStyle: 'italic' }}>I</span></ToolBtn>
            <ToolBtn t={t} title="行内代码" onClick={function () { wrap('`', '`'); }}>{'</>'}</ToolBtn>
            <ToolBtn t={t} title="标题" onClick={function () { wrap('## ', ''); }}>H</ToolBtn>
            <ToolBtn t={t} title="列表" onClick={function () { wrap('- ', '', true); }}>•</ToolBtn>
            <ToolBtn t={t} title="引用" onClick={function () { wrap('> ', ''); }}>❝</ToolBtn>
            <ToolBtn t={t} title="待办" onClick={function () { wrap('- [ ] ', '', true); }}>☑</ToolBtn>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: t.faint, fontFamily: t.fontMono }}>{words} 词</span>
          </div>
        )}

        {/* footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px',
          borderTop: '1px solid ' + t.border, background: t.surface, fontSize: 11, color: t.muted,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: saved ? t.accent : t.faint }} />
          {saved ? '已保存到本地' : '编辑中…'}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: t.fontMono, fontSize: 10, color: t.faint }}>⌘S 保存</span>
        </div>
      </div>
    );
  }

  window.MDSidePanel = MDSidePanel;
})();
