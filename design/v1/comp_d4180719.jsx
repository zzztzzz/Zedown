/* FullEditor.jsx — full-screen editor surface (new-tab / standalone).
   File tree with folders + create note / create folder / import .md /
   rename / delete, live split preview, view modes, reading hands off to
   the full mdReader. Exports window.MDFullEditor.
   Props: { themeId, onTheme, seed, onChange, onRead } */
(function () {
  const { useState, useRef, useCallback, useEffect } = React;
  const T = window.MD_TOKENS;

  // ── immutable tree helpers ─────────────────────────────────
  function findNode(nodes, id) {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const f = findNode(n.children, id); if (f) return f; }
    }
    return null;
  }
  function patchNode(nodes, id, patch) {
    return nodes.map(function (n) {
      if (n.id === id) return Object.assign({}, n, patch);
      if (n.children) return Object.assign({}, n, { children: patchNode(n.children, id, patch) });
      return n;
    });
  }
  function removeNode(nodes, id) {
    return nodes.filter(function (n) { return n.id !== id; }).map(function (n) {
      return n.children ? Object.assign({}, n, { children: removeNode(n.children, id) }) : n;
    });
  }
  function addToFolder(nodes, folderId, child) {
    if (!folderId) return nodes.concat([child]);
    return nodes.map(function (n) {
      if (n.id === folderId) return Object.assign({}, n, { open: true, children: (n.children || []).concat([child]) });
      if (n.children) return Object.assign({}, n, { children: addToFolder(n.children, folderId, child) });
      return n;
    });
  }
  function firstFile(nodes) {
    for (const n of nodes) {
      if (n.type === 'file') return n.id;
      if (n.children) { const f = firstFile(n.children); if (f) return f; }
    }
    return null;
  }
  function flatFiles(nodes, out) {
    out = out || [];
    nodes.forEach(function (n) {
      if (n.type === 'file') out.push(n);
      if (n.children) flatFiles(n.children, out);
    });
    return out;
  }

  function ViewSeg({ t, active, onClick, children }) {
    return (
      <button onClick={onClick} style={{
        border: 'none', cursor: 'pointer', fontFamily: t.fontUI, fontSize: 12.5, fontWeight: 600,
        padding: '6px 14px', borderRadius: t.radius - 4, color: active ? t.text : t.muted,
        background: active ? t.surface : 'transparent', boxShadow: active ? t.shadow : 'none',
        transition: 'all .15s',
      }}>{children}</button>
    );
  }

  function MDFullEditor({ themeId = 'paper', onTheme, seed, onChange, onRead }) {
    const t = T[themeId];
    const [tree, setTree] = useState(function () {
      const seed0 = JSON.parse(JSON.stringify(window.MD_SAMPLE.TREE));
      if (seed != null) { const n = findNode(seed0, 'f1'); if (n) n.body = seed; }
      return seed0;
    });
    const [active, setActive] = useState('f1');
    const [mode, setMode] = useState('split');
    const [query, setQuery] = useState('');
    const [saved, setSaved] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);
    const [renaming, setRenaming] = useState(null);
    const [draft, setDraft] = useState('');
    const ref = useRef(null);
    const fileInput = useRef(null);

    const node = findNode(tree, active) || {};
    const text = node.body || '';

    const setText = useCallback(function (v) {
      setTree(function (tr) { return patchNode(tr, active, { body: v, updated: '刚刚' }); });
      setSaved(false);
      if (onChange) onChange(v);
    }, [active, onChange]);

    useEffect(function () {
      if (saved) return;
      const id = setTimeout(function () { setSaved(true); }, 1000);
      return function () { clearTimeout(id); };
    }, [text, saved]);

    const wrap = useCallback(function (pre, post) {
      const el = ref.current; if (!el) return;
      const s = el.selectionStart, e = el.selectionEnd;
      const sel = text.slice(s, e) || '文字';
      setText(text.slice(0, s) + pre + sel + (post || '') + text.slice(e));
      requestAnimationFrame(function () {
        el.focus(); el.selectionStart = s + pre.length; el.selectionEnd = s + pre.length + sel.length;
      });
    }, [text, setText]);

    // ── file ops ──
    const startRename = function (id, name) { setRenaming(id); setDraft(name); };
    const commitRename = function () {
      if (renaming) setTree(function (tr) { return patchNode(tr, renaming, { name: (draft.trim() || '未命名') }); });
      setRenaming(null);
    };
    const newNote = function (folderId) {
      const id = 'n' + Date.now();
      const file = { id: id, type: 'file', name: '未命名.md', tag: '草稿', updated: '刚刚', body: '# 未命名\n\n' };
      setTree(function (tr) { return addToFolder(tr, folderId || null, file); });
      setActive(id); setMode('split'); setSaved(false); setMenuOpen(false);
      startRename(id, '未命名.md');
    };
    const newFolder = function () {
      const id = 'd' + Date.now();
      setTree(function (tr) { return tr.concat([{ id: id, type: 'folder', name: '新建文件夹', open: true, children: [] }]); });
      setMenuOpen(false); startRename(id, '新建文件夹');
    };
    const del = function (id) {
      setTree(function (tr) {
        const next = removeNode(tr, id);
        if (id === active) { const f = firstFile(next); setTimeout(function () { setActive(f); }, 0); }
        return next;
      });
    };
    const toggleFolder = function (id) { setTree(function (tr) { const n = findNode(tr, id); return patchNode(tr, id, { open: !n.open }); }); };
    const importFiles = function (e) {
      const list = Array.from(e.target.files || []);
      let lastId = null;
      let pending = list.length;
      if (!pending) return;
      list.forEach(function (f) {
        const r = new FileReader();
        r.onload = function () {
          const id = 'i' + Date.now() + Math.random().toString(36).slice(2, 5);
          lastId = id;
          const file = { id: id, type: 'file', name: f.name, tag: '导入', updated: '刚刚', body: String(r.result || '') };
          setTree(function (tr) { return tr.concat([file]); });
          pending--;
          if (pending === 0 && lastId) { setActive(lastId); setMode('split'); setSaved(false); }
        };
        r.readAsText(f);
      });
      e.target.value = '';
      setMenuOpen(false);
    };

    const chars = text.length;
    const words = (text.trim().match(/[\u4e00-\u9fa5]|\w+/g) || []).length;

    // ── tree rendering ──
    function RenameInput({ id, name }) {
      return (
        <input autoFocus value={draft}
          onChange={function (e) { setDraft(e.target.value); }}
          onBlur={commitRename}
          onClick={function (e) { e.stopPropagation(); }}
          onKeyDown={function (e) {
            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
            if (e.key === 'Escape') { setRenaming(null); }
          }}
          style={{
            flex: 1, minWidth: 0, border: '1px solid ' + t.accent, borderRadius: 5, outline: 'none',
            background: t.surface, color: t.text, fontSize: 13, padding: '2px 6px', fontFamily: t.fontUI,
          }} />
      );
    }

    function Row({ children, onClick, depth, on }) {
      return (
        <div className="md-row" onClick={onClick} style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', position: 'relative',
          padding: '7px 9px', paddingLeft: 9 + depth * 14, borderRadius: t.radius, marginBottom: 1,
          background: on ? t.surface : 'transparent', boxShadow: on ? t.shadow : 'none',
          border: '1px solid ' + (on ? t.border : 'transparent'),
        }}>{children}</div>
      );
    }

    function renderNodes(nodes, depth) {
      return nodes.map(function (n) {
        if (n.type === 'folder') {
          const count = (n.children || []).filter(function (c) { return c.type === 'file'; }).length;
          return (
            <div key={n.id}>
              <Row depth={depth} onClick={function () { toggleFolder(n.id); }}>
                <span style={{ width: 12, color: t.faint, fontSize: 10, transition: 'transform .15s', transform: n.open ? 'rotate(90deg)' : 'none' }}>▶</span>
                <span style={{ fontSize: 13.5 }}>{n.open ? '📂' : '📁'}</span>
                {renaming === n.id
                  ? <RenameInput id={n.id} name={n.name} />
                  : <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</span>}
                <span style={{ fontSize: 11, color: t.faint, fontFamily: t.fontMono }}>{count}</span>
                <span className="md-actions" style={{ display: 'none', gap: 2 }}>
                  <button title="在此新建" onClick={function (e) { e.stopPropagation(); newNote(n.id); }} style={iconBtn(t)}>＋</button>
                  <button title="重命名" onClick={function (e) { e.stopPropagation(); startRename(n.id, n.name); }} style={iconBtn(t)}>✎</button>
                </span>
              </Row>
              {n.open && <div>{renderNodes(n.children || [], depth + 1)}</div>}
            </div>
          );
        }
        const on = n.id === active;
        return (
          <Row key={n.id} depth={depth} on={on} onClick={function () { setActive(n.id); }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? t.accent : t.faint, flexShrink: 0, marginLeft: 3 }} />
            {renaming === n.id
              ? <RenameInput id={n.id} name={n.name} />
              : (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: on ? t.text : t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</div>
                  <div style={{ display: 'flex', gap: 7, marginTop: 2, fontSize: 10.5, color: t.faint }}>
                    <span style={{ fontFamily: t.fontMono }}>{n.tag}</span><span>·</span><span>{n.updated}</span>
                  </div>
                </div>
              )}
            <span className="md-actions" style={{ display: 'none', gap: 2 }}>
              <button title="重命名" onClick={function (e) { e.stopPropagation(); startRename(n.id, n.name); }} style={iconBtn(t)}>✎</button>
              <button title="删除" onClick={function (e) { e.stopPropagation(); del(n.id); }} style={iconBtn(t)}>✕</button>
            </span>
          </Row>
        );
      });
    }

    const searchHits = query ? flatFiles(tree).filter(function (f) { return f.name.toLowerCase().indexOf(query.toLowerCase()) > -1; }) : null;

    const editor = (
      <textarea ref={ref} value={text} spellCheck={false}
        onChange={function (e) { setText(e.target.value); }}
        onKeyDown={function (e) {
          if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); wrap('**', '**'); }
          if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); wrap('*', '*'); }
        }}
        style={{
          width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none',
          background: 'transparent', color: t.text, padding: mode === 'edit' ? '34px 18%' : '26px 30px',
          fontFamily: t.fontMono, fontSize: 14, lineHeight: 1.75, boxSizing: 'border-box',
        }} />
    );
    const preview = (
      <div className="prose" style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '26px 34px' }}
        dangerouslySetInnerHTML={{ __html: window.mdToHtml(text) }} />
    );

    // Reading mode IS the full-screen mdReader — takes over the whole surface.
    if (mode === 'read') {
      return (
        <MDReader themeId={themeId} onTheme={onTheme} content={text} title={node.name}
          onEdit={function () { setMode('split'); }} />
      );
    }

    return (
      <div className={'theme-' + themeId} style={{
        width: '100%', height: '100%', display: 'flex', overflow: 'hidden',
        background: t.app, fontFamily: t.fontUI, color: t.text,
      }}>
        <style>{'.theme-' + themeId + ' .md-row:hover .md-actions{display:flex !important;}'}</style>
        <input ref={fileInput} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple
          onChange={importFiles} style={{ display: 'none' }} />

        {/* ── file rail ── */}
        <div style={{
          width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: t.surface2, borderRight: '1px solid ' + t.border,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '15px 14px 12px', position: 'relative' }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7, background: t.accent, color: t.accentText,
              display: 'grid', placeItems: 'center', fontFamily: t.fontMono, fontWeight: 800, fontSize: 14,
            }}>M</div>
            <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Markdown</span>
            <button title="新建" onClick={function () { setMenuOpen(function (o) { return !o; }); }} style={{
              width: 28, height: 28, borderRadius: 8, border: '1px solid ' + t.border, cursor: 'pointer',
              background: menuOpen ? t.accent : t.surface, color: menuOpen ? t.accentText : t.muted,
              fontSize: 18, lineHeight: 1, display: 'grid', placeItems: 'center',
            }}>+</button>
            {menuOpen && (
              <React.Fragment>
                <div onClick={function () { setMenuOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: 46, right: 14, zIndex: 41, width: 168,
                  background: t.surface, border: '1px solid ' + t.border, borderRadius: t.radius,
                  boxShadow: '0 10px 30px rgba(0,0,0,.18)', overflow: 'hidden', padding: 5,
                }}>
                  {[['📄', '新建笔记', function () { newNote(null); }],
                    ['📁', '新建文件夹', newFolder],
                    ['↥', '导入 .md', function () { fileInput.current && fileInput.current.click(); }]].map(function (it, k) {
                    return (
                      <button key={k} onClick={it[2]} style={{
                        display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                        border: 'none', background: 'transparent', cursor: 'pointer', color: t.text,
                        fontFamily: t.fontUI, fontSize: 13, padding: '8px 10px', borderRadius: t.radius - 3,
                      }} onMouseEnter={function (e) { e.currentTarget.style.background = t.surface2; }}
                        onMouseLeave={function (e) { e.currentTarget.style.background = 'transparent'; }}>
                        <span style={{ width: 16, textAlign: 'center' }}>{it[0]}</span>{it[1]}
                      </button>
                    );
                  })}
                </div>
              </React.Fragment>
            )}
          </div>

          <div style={{ padding: '0 12px 10px' }}>
            <input value={query} onChange={function (e) { setQuery(e.target.value); }} placeholder="搜索笔记…"
              style={{
                width: '100%', boxSizing: 'border-box', border: '1px solid ' + t.border, borderRadius: t.radius,
                background: t.surface, color: t.text, padding: '7px 11px', fontSize: 12.5, outline: 'none', fontFamily: t.fontUI,
              }} />
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '0 8px 8px' }}>
            {searchHits
              ? (searchHits.length ? searchHits.map(function (f) {
                  const on = f.id === active;
                  return (
                    <Row key={f.id} depth={0} on={on} onClick={function () { setActive(f.id); }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? t.accent : t.faint, marginLeft: 3 }} />
                      <span style={{ flex: 1, fontSize: 13, color: on ? t.text : t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                    </Row>
                  );
                }) : <div style={{ padding: '20px 12px', fontSize: 12.5, color: t.faint, textAlign: 'center' }}>没有匹配的笔记</div>)
              : renderNodes(tree, 0)}
          </div>

          {/* theme dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderTop: '1px solid ' + t.border }}>
            <span style={{ fontSize: 11, color: t.faint, marginRight: 'auto' }}>主题</span>
            {window.MD_THEMES.map(function (th) {
              return (
                <button key={th.id} title={th.label} onClick={function () { onTheme && onTheme(th.id); }} style={{
                  width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', padding: 0, background: T[th.id].accent,
                  border: '2px solid ' + (th.id === themeId ? t.text : 'transparent'), outline: '1px solid ' + t.border,
                }} />
              );
            })}
          </div>
        </div>

        {/* ── main ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: t.surface }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '0 20px', height: 56,
            borderBottom: '1px solid ' + t.border, flexShrink: 0,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name || '未命名'}</div>
              <div style={{ fontSize: 11, color: t.faint, marginTop: 1 }}>{node.tag || '草稿'} · 更新于 {node.updated || '刚刚'}</div>
            </div>
            <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: t.radius, background: t.surface2, border: '1px solid ' + t.border }}>
              <ViewSeg t={t} active={mode === 'edit'} onClick={function () { setMode('edit'); }}>编辑</ViewSeg>
              <ViewSeg t={t} active={mode === 'split'} onClick={function () { setMode('split'); }}>分屏</ViewSeg>
              <ViewSeg t={t} active={mode === 'read'} onClick={function () { setMode('read'); }}>阅读</ViewSeg>
            </div>
            <button style={{
              border: '1px solid ' + t.border, background: t.surface, color: t.muted, cursor: 'pointer',
              borderRadius: t.radius, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, fontFamily: t.fontUI,
            }}>导出 ↧</button>
            {onRead && (
              <button onClick={onRead} title="以只读阅读模式打开" style={{
                border: 'none', background: t.accent, color: t.accentText, cursor: 'pointer',
                borderRadius: t.radius, padding: '7px 15px', fontSize: 12.5, fontWeight: 700, fontFamily: t.fontUI,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>完成·阅读 <span style={{ fontSize: 14 }}>↗</span></button>
            )}
            {!onRead && (
              <button style={{
                border: 'none', background: t.accent, color: t.accentText, cursor: 'pointer',
                borderRadius: t.radius, padding: '7px 15px', fontSize: 12.5, fontWeight: 700, fontFamily: t.fontUI,
              }}>分享</button>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {mode === 'edit' && <div style={{ flex: 1, position: 'relative', overflow: 'auto' }}>{editor}</div>}
            {mode === 'split' && (
              <React.Fragment>
                <div style={{ flex: 1, position: 'relative', overflow: 'auto', borderRight: '1px solid ' + t.border }}>{editor}</div>
                <div style={{ flex: 1, position: 'relative', background: t.surface }}>{preview}</div>
              </React.Fragment>
            )}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', height: 32, flexShrink: 0,
            borderTop: '1px solid ' + t.border, background: t.surface2, fontSize: 11.5, color: t.muted,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: saved ? t.accent : t.faint }} />
              {saved ? '已同步' : '保存中…'}
            </span>
            <span style={{ fontFamily: t.fontMono }}>{words} 词</span>
            <span style={{ fontFamily: t.fontMono }}>{chars} 字符</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: t.fontMono, color: t.faint }}>Markdown · UTF-8</span>
          </div>
        </div>
      </div>
    );
  }

  function iconBtn(t) {
    return {
      width: 20, height: 20, display: 'grid', placeItems: 'center', cursor: 'pointer',
      border: 'none', borderRadius: 5, background: 'transparent', color: t.muted, fontSize: 11,
    };
  }

  window.MDFullEditor = MDFullEditor;
})();
