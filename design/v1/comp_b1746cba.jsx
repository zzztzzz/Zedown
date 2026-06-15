/* MDReader.jsx — read-only full-screen Markdown reader ("mdReader").
   Auto table-of-contents, reading-progress bar, font-size & theme controls.
   No editing surface. Exports window.MDReader. Props: { themeId, onTheme } */
(function () {
  const { useState, useRef, useEffect, useCallback } = React;
  const T = window.MD_TOKENS;

  function slug(s, i) { return 'h-' + i + '-' + (s || '').replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 24); }

  function MDReader({ themeId = 'paper', onTheme, content, onEdit, title }) {
    const t = T[themeId];
    const src = content != null ? content : window.MD_SAMPLE.ARTICLE;
    const html = window.mdToHtml(src);
    const proseRef = useRef(null);
    const scrollRef = useRef(null);
    const [toc, setToc] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [scale, setScale] = useState(1);
    const [progress, setProgress] = useState(0);

    // build TOC from rendered headings (read-only side effect)
    useEffect(function () {
      const root = proseRef.current; if (!root) return;
      const hs = Array.from(root.querySelectorAll('h1, h2, h3'));
      const items = hs.map(function (el, i) {
        const id = slug(el.textContent, i);
        el.id = id;
        return { id: id, text: el.textContent, level: Number(el.tagName[1]) };
      });
      setToc(items);
      if (items[0]) setActiveId(items[0].id);
    }, [themeId, src]);

    const onScroll = useCallback(function () {
      const sc = scrollRef.current, root = proseRef.current; if (!sc || !root) return;
      const max = sc.scrollHeight - sc.clientHeight;
      setProgress(max > 0 ? Math.min(1, sc.scrollTop / max) : 1);
      // active heading = last one above the 1/3 line
      const line = sc.scrollTop + sc.clientHeight * 0.28;
      let cur = null;
      root.querySelectorAll('h1, h2, h3').forEach(function (el) {
        if (el.offsetTop <= line) cur = el.id;
      });
      if (cur) setActiveId(cur);
    }, []);

    const jump = useCallback(function (id) {
      const sc = scrollRef.current; const el = document.getElementById(id);
      if (sc && el) sc.scrollTo({ top: el.offsetTop - 28, behavior: 'smooth' });
    }, []);

    return (
      <div className={'theme-' + themeId} style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: t.surface, fontFamily: t.fontUI, color: t.text, position: 'relative',
      }}>
        {/* progress bar */}
        <div style={{ height: 3, background: t.border, flexShrink: 0 }}>
          <div style={{ height: '100%', width: (progress * 100) + '%', background: t.accent, transition: 'width .1s linear' }} />
        </div>

        {/* top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', height: 54, flexShrink: 0,
          borderBottom: '1px solid ' + t.border, background: t.surface2,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: 7, background: t.accent, color: t.accentText,
            display: 'grid', placeItems: 'center', fontFamily: t.fontMono, fontWeight: 800, fontSize: 12,
          }}>M</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title || '排版指南.md'}</div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '.04em', padding: '3px 9px', borderRadius: 20,
            color: t.muted, background: t.surface, border: '1px solid ' + t.border,
          }}>只读</span>
          {onEdit && (
            <button onClick={onEdit} title="在读写编辑器中打开" style={{
              border: 'none', background: t.accent, color: t.accentText, cursor: 'pointer',
              borderRadius: t.radius, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: t.fontUI,
              display: 'flex', alignItems: 'center', gap: 6,
            }}><span style={{ fontSize: 13 }}>✎</span> 编辑</button>
          )}
          {/* font size */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: t.radius, background: t.surface, border: '1px solid ' + t.border }}>
            <button onClick={function () { setScale(function (s) { return Math.max(0.85, +(s - 0.1).toFixed(2)); }); }}
              style={readerBtn(t, 13)}>A−</button>
            <button onClick={function () { setScale(function (s) { return Math.min(1.4, +(s + 0.1).toFixed(2)); }); }}
              style={readerBtn(t, 16)}>A+</button>
          </div>
          {/* theme dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {window.MD_THEMES.map(function (th) {
              return (
                <button key={th.id} title={th.label} onClick={function () { onTheme && onTheme(th.id); }}
                  style={{
                    width: 17, height: 17, borderRadius: '50%', cursor: 'pointer', padding: 0,
                    background: T[th.id].accent,
                    border: '2px solid ' + (th.id === themeId ? t.text : 'transparent'),
                    outline: '1px solid ' + t.border,
                  }} />
              );
            })}
          </div>
        </div>

        {/* body: TOC + article */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* TOC */}
          <div style={{
            width: 232, flexShrink: 0, borderRight: '1px solid ' + t.border, background: t.surface2,
            padding: '26px 20px', overflow: 'auto',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: t.faint, marginBottom: 14, textTransform: 'uppercase' }}>目录</div>
            {toc.map(function (it) {
              const on = it.id === activeId;
              return (
                <div key={it.id} onClick={function () { jump(it.id); }} style={{
                  cursor: 'pointer', fontSize: 13, lineHeight: 1.5, padding: '5px 0',
                  paddingLeft: (it.level - 1) * 13,
                  color: on ? t.text : t.muted, fontWeight: on ? 600 : 400,
                  borderLeft: '2px solid ' + (on ? t.accent : 'transparent'),
                  marginLeft: -20, paddingLeftAdjust: 0,
                  transition: 'color .12s',
                }}>
                  <span style={{ marginLeft: 20 - 2 }}>{it.text}</span>
                </div>
              );
            })}
          </div>

          {/* article */}
          <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            <div ref={proseRef} className="prose"
              style={{ maxWidth: 680, margin: '0 auto', padding: '54px 40px 120px', fontSize: 16 * scale }}
              dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>
    );
  }

  function readerBtn(t, fs) {
    return {
      border: 'none', background: 'transparent', cursor: 'pointer', color: t.muted,
      fontFamily: t.fontUI, fontWeight: 600, fontSize: fs, padding: '3px 8px', borderRadius: t.radius - 4,
      lineHeight: 1,
    };
  }

  window.MDReader = MDReader;
})();
