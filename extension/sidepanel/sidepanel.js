/* sidepanel.js — vanilla JS port of MDSidePanel (design-src/comp_5520dcd4.jsx).
   Edits the shared scratch note via MDStore. Debounced autosave (~900ms),
   edit/preview toggle, formatting toolbar, word count, Cmd/Ctrl+S force save.
   Theme comes from MDStore.getTheme(); root carries class theme-<id>.
   Stays in sync with other surfaces via MDStore.onChange. */
(function () {
  'use strict';

  const T = window.MD_TOKENS;

  // tiny DOM helper: h(tag, props, ...children)
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null) continue;
        if (k === 'style' && typeof v === 'object') {
          Object.assign(el.style, v);
        } else if (k === 'class') {
          el.className = v;
        } else if (k === 'dataset' && typeof v === 'object') {
          Object.assign(el.dataset, v);
        } else {
          el[k] = v;
        }
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number'
        ? document.createTextNode(String(c)) : c);
    }
    return el;
  }

  // ── module state ───────────────────────────────────────────────
  let themeId = 'paper';
  let mode = 'edit';        // 'edit' | 'preview'
  let text = '';
  let saved = true;
  let saveTimer = null;     // debounce autosave -> MDStore.setScratch
  let selfWrite = false;    // guard so our own storage writes don't echo back

  const root = document.getElementById('root');

  // references rebuilt each render
  let textareaEl = null;
  let clipToast = '';       // transient "已剪藏" header state
  let clipReason = '';      // failure reason text (shown on fail)
  let clipTimer = null;

  // ── persistence: debounced autosave ────────────────────────────
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(commitSave, 900);
  }

  function commitSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    selfWrite = true;
    Promise.resolve(window.MDStore.setScratch(text)).then(function () {
      selfWrite = false;
    });
    if (!saved) { saved = true; refreshStatus(); }
  }

  // ── editing actions ────────────────────────────────────────────
  function onInput(value) {
    text = value;
    if (saved) { saved = false; refreshStatus(); }
    refreshWordCount();
    scheduleSave();
  }

  // wrap selection like the prototype's wrap()
  function wrap(pre, post, block) {
    const el = textareaEl;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = text.slice(s, e) || (block ? '列表项' : '文字');
    const next = text.slice(0, s) + pre + sel + (post || '') + text.slice(e);
    text = next;
    el.value = next;
    if (saved) { saved = false; refreshStatus(); }
    refreshWordCount();
    scheduleSave();
    requestAnimationFrame(function () {
      el.focus();
      el.selectionStart = s + pre.length;
      el.selectionEnd = s + pre.length + sel.length;
    });
  }

  function wordCount() {
    return (text.trim().match(/[一-龥]|\w+/g) || []).length;
  }

  // ── 剪藏 transient state ────────────────────────────────────────
  function showClip(state, reason) {
    clipToast = state;
    clipReason = reason || '';
    render();
    if (clipTimer) clearTimeout(clipTimer);
    // keep failures visible longer so the reason can be read
    clipTimer = setTimeout(function () { clipToast = ''; clipReason = ''; render(); }, state === 'fail' ? 8000 : 1600);
  }

  // Clip the active tab DIRECTLY from the side panel (no background round-trip):
  // inject content/extract.js into the page, get { title, url, markdown }, then
  // append a note under the 网页剪藏 folder. Avoids the messaging failure mode.
  async function clipPageNow() {
    let tab;
    try {
      const r1 = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tab = r1 && r1[0];
      if (!tab) { const r2 = await chrome.tabs.query({ active: true, currentWindow: true }); tab = r2 && r2[0]; }
    } catch (e) { /* ignore */ }
    if (!tab || tab.id == null) { showClip('fail', '找不到当前标签页'); return; }
    if (!/^https?:\/\//i.test(tab.url || '')) {
      showClip('fail', '此页面无法剪藏（仅支持普通网页 http/https；chrome:// / 应用商店 / 本地文件 / 新标签页不行）');
      return;
    }
    let data;
    try {
      const r = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/extract.js'] });
      data = r && r[0] && r[0].result;
    } catch (e) {
      showClip('fail', '无法读取此页面：' + ((e && e.message) || e));
      return;
    }
    if (!data || !data.markdown) { showClip('fail', '未提取到正文内容'); return; }
    try {
      await appendClipNote(data);
      showClip('done');
    } catch (e) { showClip('fail', '保存失败：' + ((e && e.message) || e)); }
  }

  async function appendClipNote(data) {
    const title = ((data.title || '未命名') + '').trim() || '未命名';
    const url = data.url || '';
    let domain = '网页';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { /* keep default */ }
    const ts = Date.now();
    let tree = await window.MDStore.getTree();
    if (!Array.isArray(tree)) tree = [];
    const file = {
      id: 'clip' + ts, type: 'file', name: (title.slice(0, 40) || '剪藏') + '.md',
      tag: domain, updated: '刚刚',
      body: '# ' + title + '\n\n> 来源: ' + url + '\n\n' + (data.markdown || ''),
    };
    let next;
    if (window.MDStore.findNode(tree, 'clip-web')) {
      next = window.MDStore.addToFolder(tree, 'clip-web', file);
    } else {
      next = tree.concat([{ id: 'clip-web', type: 'folder', name: '网页剪藏', open: true, children: [file] }]);
    }
    await window.MDStore.setTree(next);
  }

  // ── textarea editing primitives (caret-aware) ──────────────────
  // Apply a value+caret change to the textarea + module state in one place.
  function setEditor(value, selStart, selEnd) {
    const el = textareaEl;
    text = value;
    if (el) {
      el.value = value;
      if (selStart != null) {
        el.selectionStart = selStart;
        el.selectionEnd = selEnd == null ? selStart : selEnd;
      }
    }
    if (saved) { saved = false; refreshStatus(); }
    refreshWordCount();
    scheduleSave();
  }

  // line bounds containing offset `pos`
  function lineStartOf(value, pos) {
    const i = value.lastIndexOf('\n', pos - 1);
    return i < 0 ? 0 : i + 1;
  }

  // ── slash command menu ─────────────────────────────────────────
  const SLASH_CMDS = [
    { label: '标题 H2', hint: '## ', insert: '## ' },
    { label: '标题 H3', hint: '### ', insert: '### ' },
    { label: '无序列表', hint: '- ', insert: '- ' },
    { label: '有序列表', hint: '1. ', insert: '1. ' },
    { label: '待办', hint: '- [ ] ', insert: '- [ ] ' },
    { label: '引用', hint: '> ', insert: '> ' },
    { label: '代码块', hint: '```', insert: '```\n', after: '\n```' },
    { label: '表格', hint: '| | |', insert: '| 列1 | 列2 |\n| --- | --- |\n|  |  |' },
    { label: '分割线', hint: '---', insert: '---\n' },
  ];
  let slashMenuEl = null;
  let slashFrom = -1;        // index of the '/' that opened the menu
  let slashIndex = 0;        // highlighted item

  function closeSlashMenu() {
    if (slashMenuEl && slashMenuEl.parentNode) slashMenuEl.parentNode.removeChild(slashMenuEl);
    slashMenuEl = null;
    slashFrom = -1;
    slashIndex = 0;
  }

  function slashFilter() {
    if (slashFrom < 0) return SLASH_CMDS;
    const q = text.slice(slashFrom + 1, textareaEl ? textareaEl.selectionStart : slashFrom + 1).toLowerCase();
    if (!q) return SLASH_CMDS;
    return SLASH_CMDS.filter(function (c) {
      return c.label.toLowerCase().indexOf(q) >= 0 || c.hint.toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderSlashMenu() {
    const list = slashFilter();
    if (!list.length) { closeSlashMenu(); return; }
    if (slashIndex >= list.length) slashIndex = list.length - 1;
    const t = T[themeId];
    if (!slashMenuEl) {
      slashMenuEl = h('div', {
        style: {
          position: 'absolute', zIndex: 50, minWidth: '150px', maxHeight: '180px',
          overflow: 'auto', background: t.surface, border: '1px solid ' + t.borderStrong,
          borderRadius: t.radius + 'px', boxShadow: t.shadow, padding: '4px',
          fontFamily: t.fontUI, fontSize: '12px',
        },
      });
      const host = textareaEl && textareaEl.parentNode;
      if (host) {
        host.appendChild(slashMenuEl);
        slashMenuEl.style.left = '14px';
        slashMenuEl.style.top = '14px';
      }
    }
    slashMenuEl.textContent = '';
    list.forEach(function (cmd, i) {
      const row = h('div', {
        onmousedown: function (e) { e.preventDefault(); applySlash(cmd); },
        style: {
          display: 'flex', gap: '8px', alignItems: 'baseline', cursor: 'pointer',
          padding: '5px 8px', borderRadius: (t.radius - 4) + 'px',
          background: i === slashIndex ? t.accentSoft : 'transparent',
          color: t.text,
        },
      }, h('span', { style: { flex: 1 } }, cmd.label),
         h('span', { style: { color: t.faint, fontFamily: t.fontMono, fontSize: '10.5px' } }, cmd.hint));
      slashMenuEl.appendChild(row);
    });
  }

  function applySlash(cmd) {
    const el = textareaEl;
    if (!el || slashFrom < 0) { closeSlashMenu(); return; }
    const caret = el.selectionStart;
    const before = text.slice(0, slashFrom);
    const after = text.slice(caret);
    const ins = cmd.insert + (cmd.after || '');
    const value = before + ins + after;
    const newCaret = before.length + cmd.insert.length;
    closeSlashMenu();
    setEditor(value, newCaret);
    requestAnimationFrame(function () { el.focus(); });
  }

  // ── smart editing: Enter continuation, auto-pair, Cmd/Ctrl+K link ─
  const PAIRS = { '*': '*', '`': '`', '[': ']', '(': ')' };

  function onEditorKeydown(ev) {
    const el = textareaEl;
    if (!el) return;

    // slash menu navigation takes priority
    if (slashMenuEl) {
      const list = slashFilter();
      if (ev.key === 'ArrowDown') { ev.preventDefault(); slashIndex = (slashIndex + 1) % list.length; renderSlashMenu(); return; }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); slashIndex = (slashIndex - 1 + list.length) % list.length; renderSlashMenu(); return; }
      if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); if (list[slashIndex]) applySlash(list[slashIndex]); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); closeSlashMenu(); return; }
    }

    // Cmd/Ctrl+K → wrap selection as a markdown link
    if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault();
      const s = el.selectionStart, e = el.selectionEnd;
      const sel = text.slice(s, e) || '链接文字';
      const ins = '[' + sel + '](url)';
      const value = text.slice(0, s) + ins + text.slice(e);
      // place caret inside the url() slot
      const urlStart = s + 1 + sel.length + 2;
      setEditor(value, urlStart, urlStart + 3);
      return;
    }

    // Enter → continue list / todo / blockquote, outdent on empty marker
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
      const s = el.selectionStart;
      if (s !== el.selectionEnd) return; // don't fight selections
      const ls = lineStartOf(text, s);
      const line = text.slice(ls, s);
      const m = line.match(/^(\s*)(- \[[ xX]\] |[-*+] |\d+\. |> )(.*)$/);
      if (m) {
        const indent = m[1], rawMarker = m[2], content = m[3];
        if (content.trim() === '') {
          // empty item: remove the marker (outdent / exit list)
          ev.preventDefault();
          const value = text.slice(0, ls) + indent + text.slice(s);
          setEditor(value, ls + indent.length);
          return;
        }
        ev.preventDefault();
        let marker = rawMarker;
        const ord = rawMarker.match(/^(\d+)\. $/);
        if (ord) marker = (parseInt(ord[1], 10) + 1) + '. ';
        else if (/^- \[[ xX]\] $/.test(rawMarker)) marker = '- [ ] ';
        const ins = '\n' + indent + marker;
        const value = text.slice(0, s) + ins + text.slice(s);
        setEditor(value, s + ins.length);
        return;
      }
      return;
    }

    // Auto-pair brackets / emphasis chars
    if (PAIRS[ev.key]) {
      const s = el.selectionStart, e = el.selectionEnd;
      if (s !== e) {
        // wrap selection
        ev.preventDefault();
        const sel = text.slice(s, e);
        const open = ev.key, close = PAIRS[ev.key];
        const value = text.slice(0, s) + open + sel + close + text.slice(e);
        setEditor(value, s + 1, s + 1 + sel.length);
        return;
      }
      // only auto-close at end-of-word boundaries to avoid annoyance
      const nextCh = text.slice(s, s + 1);
      if (nextCh === '' || /\s/.test(nextCh) || PAIRS[ev.key] === nextCh) {
        ev.preventDefault();
        const open = ev.key, close = PAIRS[ev.key];
        const value = text.slice(0, s) + open + close + text.slice(s);
        setEditor(value, s + 1);
        return;
      }
    }

    // "/" opens the slash menu at line start or after whitespace
    if (ev.key === '/') {
      const s = el.selectionStart;
      const prev = text.slice(s - 1, s);
      if (s === el.selectionEnd && (prev === '' || prev === '\n' || /\s/.test(prev))) {
        // defer so the '/' is in the value, then open menu
        slashFrom = s;
        slashIndex = 0;
        requestAnimationFrame(function () { if (slashFrom >= 0) renderSlashMenu(); });
      }
      return;
    }

    // typing while menu open: re-filter (handled after default input via input event),
    // schedule a refresh
    if (slashMenuEl && (ev.key === 'Backspace' || ev.key.length === 1)) {
      requestAnimationFrame(function () {
        if (!textareaEl) { closeSlashMenu(); return; }
        const caret = textareaEl.selectionStart;
        if (caret <= slashFrom || text.slice(slashFrom, slashFrom + 1) !== '/') { closeSlashMenu(); return; }
        renderSlashMenu();
      });
    }
  }

  // ── targeted refreshers (avoid full re-render while typing) ─────
  function refreshStatus() {
    const t = T[themeId];
    const dot = root.querySelector('[data-role="status-dot"]');
    const label = root.querySelector('[data-role="status-label"]');
    if (dot) dot.style.background = saved ? t.accent : t.faint;
    if (label) label.textContent = saved ? '已保存到本地' : '编辑中…';
  }

  function refreshWordCount() {
    const wc = root.querySelector('[data-role="word-count"]');
    if (wc) wc.textContent = wordCount() + ' 词';
  }

  // ── render ─────────────────────────────────────────────────────
  function render() {
    closeSlashMenu();
    const t = T[themeId];

    // preserve textarea caret/focus across re-render in edit mode
    let restore = null;
    if (textareaEl && document.activeElement === textareaEl) {
      restore = { s: textareaEl.selectionStart, e: textareaEl.selectionEnd };
    }

    root.className = 'theme-' + themeId;
    Object.assign(root.style, {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: t.surface2, fontFamily: t.fontUI, color: t.text,
      borderLeft: '1px solid ' + t.borderStrong, boxSizing: 'border-box',
    });
    root.textContent = '';

    // header
    const brand = h('div', {
      style: {
        width: '22px', height: '22px', borderRadius: '6px', background: t.accent,
        color: t.accentText, display: 'grid', placeItems: 'center',
        fontFamily: t.fontMono, fontWeight: 800, fontSize: '12px',
      },
    }, 'Z');

    const title = h('span', {
      style: {
        fontWeight: 700, fontSize: '13px', flex: 1,
        letterSpacing: themeId === 'midnight' ? '.01em' : 0,
      },
    }, 'Zedown');

    const tag = h('span', { style: { fontSize: '11px', color: t.faint } }, '速记');

    // V3 header icon buttons (match SidePanel.jsx): an "open in editor" icon and
    // a "collapse panel" ✕ icon, both bare 24×24 ghost buttons.
    function iconBtn(title, pathD, swidth, vw, onClick, withJoin) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', String(vw)); svg.setAttribute('height', String(vw));
      svg.setAttribute('viewBox', '0 0 12 12'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', swidth);
      svg.setAttribute('stroke-linecap', 'round');
      if (withJoin) svg.setAttribute('stroke-linejoin', 'round');
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', pathD);
      svg.appendChild(p);
      const btn = h('button', {
        title: title,
        onmousedown: function (e) { e.preventDefault(); },
        onclick: onClick,
        style: {
          width: '24px', height: '24px', display: 'grid', placeItems: 'center',
          cursor: 'pointer', border: 'none', borderRadius: '6px',
          background: 'transparent', color: t.muted, transition: 'all .12s',
          flex: '0 0 auto',
        },
      }, svg);
      btn.addEventListener('mouseenter', function () {
        btn.style.background = t.surface2; btn.style.color = t.text;
      });
      btn.addEventListener('mouseleave', function () {
        btn.style.background = 'transparent'; btn.style.color = t.muted;
      });
      return btn;
    }

    // "open in editor" — opens the full-screen editor in a new tab, then closes
    // the panel (window.close() from the panel's own document collapses it).
    const openBtn = iconBtn('在编辑器中打开',
      'M4.5 1.5H1.5V10.5H10.5V7.5M7 1.5h3.5V5M10.5 1.5L5.5 6.5', '1.5', 13,
      function () {
        if (window.MDStore.openEditor) window.MDStore.openEditor();
        window.close();
      }, true);

    // "collapse panel" — closes the side panel.
    const collapseBtn = iconBtn('收起面板',
      'M3 3l6 6M9 3l-6 6', '1.6', 12,
      function () { window.close(); });

    const headerActions = h('div', { style: { display: 'flex', gap: '2px', flex: '0 0 auto' } },
      openBtn, collapseBtn);

    // "剪藏整页" button — messages the background to clip the active tab into
    // the notes. Shows a brief "已剪藏" state on success.
    function clipIcon() {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('width', '11'); svg.setAttribute('height', '11');
      svg.setAttribute('viewBox', '0 0 12 12'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', 'M2.5 4.5h7M2.5 4.5l.7 5.5a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.7-5.5M4.5 4.5V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v2');
      svg.appendChild(p);
      return svg;
    }
    const clipped = clipToast === 'done';
    const clipFailed = clipToast === 'fail';
    const clipLabel = clipped ? '已剪藏' : clipFailed ? '剪藏失败' : '剪藏整页';
    const clipColor = clipFailed ? '#c0392b' : t.accent;
    const clipBtn = h('button', {
      title: '剪藏当前网页到笔记',
      onclick: function () { clipPageNow(); },
      style: {
        display: 'flex', alignItems: 'center', gap: '5px',
        border: '1px solid ' + ((clipped || clipFailed) ? clipColor : t.border),
        background: (clipped || clipFailed) ? clipColor : t.surface,
        color: (clipped || clipFailed) ? '#fff' : t.muted,
        borderRadius: (t.radius - 3) + 'px', padding: '4px 9px', cursor: 'pointer',
        fontFamily: t.fontUI, fontSize: '11.5px', fontWeight: 600, lineHeight: 1,
        transition: 'all .12s', flex: '0 0 auto',
      },
    }, clipIcon(), h('span', {}, clipLabel));
    if (!clipped && !clipFailed) {
      clipBtn.addEventListener('mouseenter', function () {
        clipBtn.style.background = t.accent; clipBtn.style.color = t.accentText;
        clipBtn.style.borderColor = t.accent;
      });
      clipBtn.addEventListener('mouseleave', function () {
        clipBtn.style.background = t.surface; clipBtn.style.color = t.muted;
        clipBtn.style.borderColor = t.border;
      });
    }

    const header = h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '9px', padding: '11px 13px',
        borderBottom: '1px solid ' + t.border, background: t.surface, flex: '0 0 auto',
      },
    }, brand, title, tag, clipBtn, headerActions);

    // segmented tabs
    function seg(label, active, onClick) {
      return h('button', {
        onclick: onClick,
        style: {
          flex: 1, border: 'none', cursor: 'pointer', fontFamily: t.fontUI,
          fontSize: '12px', fontWeight: 600, padding: '6px 0',
          borderRadius: (t.radius - 3) + 'px',
          color: active ? t.text : t.muted,
          background: active ? t.surface : 'transparent',
          boxShadow: active ? t.shadow : 'none',
          transition: 'all .15s',
        },
      }, label);
    }
    const segGroup = h('div', {
      style: {
        display: 'flex', gap: '3px', flex: 1, background: t.surface2,
        padding: '3px', borderRadius: t.radius + 'px', border: '1px solid ' + t.border,
      },
    },
      seg('编辑', mode === 'edit', function () { if (mode !== 'edit') { mode = 'edit'; render(); } }),
      seg('预览', mode === 'preview', function () { if (mode !== 'preview') { mode = 'preview'; render(); } })
    );
    const tabs = h('div', {
      style: { display: 'flex', gap: '3px', padding: '7px', background: t.surface2, flex: '0 0 auto' },
    }, segGroup);

    // body
    let body;
    if (mode === 'edit') {
      textareaEl = h('textarea', {
        spellcheck: false,
        value: text,
        oninput: function (ev) { onInput(ev.target.value); },
        onkeydown: function (ev) { onEditorKeydown(ev); },
        style: {
          width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none',
          background: 'transparent', color: t.text, padding: '14px 15px',
          fontFamily: t.fontMono, fontSize: '12.5px', lineHeight: 1.7, boxSizing: 'border-box',
        },
      });
      body = h('div', {
        style: { flex: 1, minHeight: 0, position: 'relative', background: t.surface },
      }, textareaEl);
    } else {
      textareaEl = null;
      const prose = h('div', {
        class: 'prose',
        style: { position: 'absolute', inset: 0, overflow: 'auto', padding: '16px 16px 28px' },
      });
      prose.innerHTML = window.mdToHtml(text);
      if (globalThis.MDEnhance && globalThis.MDEnhance.codeCopyButtons) {
        globalThis.MDEnhance.codeCopyButtons(prose);
      }
      // Math (KaTeX) is already final HTML from md.js. Render Mermaid diagrams
      // (no-op when mermaid absent). Theme drives mermaid's light/dark palette.
      if (globalThis.MDEnhance && globalThis.MDEnhance.renderMermaid) {
        globalThis.MDEnhance.renderMermaid(prose, themeId);
      }
      body = h('div', {
        style: { flex: 1, minHeight: 0, position: 'relative', background: t.surface },
      }, prose);
    }

    // toolbar (edit mode only)
    let toolbar = null;
    if (mode === 'edit') {
      function toolBtn(label, title, onClick, italic) {
        const span = italic
          ? h('span', { style: { fontStyle: 'italic' } }, label)
          : label;
        const btn = h('button', {
          title: title,
          onmousedown: function (e) { e.preventDefault(); },
          onclick: onClick,
          style: {
            width: '28px', height: '28px', display: 'grid', placeItems: 'center',
            cursor: 'pointer', border: 'none', borderRadius: '6px', background: 'transparent',
            color: t.muted, fontFamily: t.fontMono, fontSize: '13px', fontWeight: 700,
            transition: 'all .12s',
          },
        }, span);
        btn.addEventListener('mouseenter', function () {
          btn.style.background = t.surface2; btn.style.color = t.text;
        });
        btn.addEventListener('mouseleave', function () {
          btn.style.background = 'transparent'; btn.style.color = t.muted;
        });
        return btn;
      }

      const wc = h('span', {
        dataset: { role: 'word-count' },
        style: { fontSize: '11px', color: t.faint, fontFamily: t.fontMono },
      }, wordCount() + ' 词');

      toolbar = h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '2px', padding: '5px 8px',
          borderTop: '1px solid ' + t.border, background: t.surface2, flex: '0 0 auto',
        },
      },
        toolBtn('B', '加粗', function () { wrap('**', '**'); }),
        toolBtn('I', '斜体', function () { wrap('*', '*'); }, true),
        toolBtn('</>', '行内代码', function () { wrap('`', '`'); }),
        toolBtn('H', '标题', function () { wrap('## ', ''); }),
        toolBtn('•', '列表', function () { wrap('- ', '', true); }),
        toolBtn('❝', '引用', function () { wrap('> ', ''); }),
        toolBtn('☑', '待办', function () { wrap('- [ ] ', '', true); }),
        h('div', { style: { flex: 1 } }),
        wc
      );
    }

    // footer
    const dot = h('span', {
      dataset: { role: 'status-dot' },
      style: {
        width: '7px', height: '7px', borderRadius: '50%',
        background: saved ? t.accent : t.faint, flex: '0 0 auto',
      },
    });
    const statusLabel = h('span', { dataset: { role: 'status-label' } },
      saved ? '已保存到本地' : '编辑中…');
    const hint = h('span', {
      style: { fontFamily: t.fontMono, fontSize: '10px', color: t.faint },
    }, '⌘S 保存');
    const footer = h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 13px',
        borderTop: '1px solid ' + t.border, background: t.surface,
        fontSize: '11px', color: t.muted, flex: '0 0 auto',
      },
    }, dot, statusLabel, h('div', { style: { flex: 1 } }), hint);

    // failure reason banner (剪藏失败的具体原因)
    const failBanner = (clipFailed && clipReason)
      ? h('div', {
          style: {
            padding: '6px 13px', background: '#fdecea', color: '#a3271c',
            fontSize: '11px', lineHeight: 1.4, borderBottom: '1px solid #f0c8c2',
            flex: '0 0 auto', wordBreak: 'break-word',
          },
        }, '剪藏失败：' + clipReason)
      : null;

    root.append(header, failBanner || document.createComment('no-fail'), tabs, body, toolbar || document.createComment('no-toolbar'), footer);

    if (restore && textareaEl) {
      textareaEl.focus();
      textareaEl.selectionStart = restore.s;
      textareaEl.selectionEnd = restore.e;
    }
  }

  // ── cross-surface sync ─────────────────────────────────────────
  function handleChange(changes) {
    if (!changes) return;
    const K = window.MDStore.KEYS;
    let needsRender = false;

    if (changes[K.theme]) {
      const nv = changes[K.theme].newValue;
      if (nv && nv !== themeId) { themeId = nv; needsRender = true; }
    }
    if (changes[K.scratch] && !selfWrite) {
      const nv = changes[K.scratch].newValue;
      if (typeof nv === 'string' && nv !== text) {
        text = nv;
        saved = true;
        needsRender = true;
      }
    }
    if (needsRender) render();
  }

  // ── keyboard: Cmd/Ctrl+S force save ────────────────────────────
  function onKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      text = textareaEl ? textareaEl.value : text;
      commitSave();
    }
  }

  // ── boot ───────────────────────────────────────────────────────
  async function start() {
    await window.MDStore.init();
    const results = await Promise.all([
      window.MDStore.getTheme(),
      window.MDStore.getScratch(),
    ]);
    themeId = results[0] || 'paper';
    if (!T[themeId]) themeId = 'paper';
    text = results[1] || '';
    saved = true;
    render();
    window.MDStore.onChange(handleChange);
    document.addEventListener('keydown', onKeydown);
    connectToggle();
  }

  // Open/close toggle support: hold a port to the service worker while the panel
  // is open. The SW uses the port's presence to know the panel is open (so the
  // keyboard command can close it) and tells us to self-close via window.close().
  function connectToggle() {
    try {
      const port = chrome.runtime.connect({ name: 'zedown-sidepanel' });
      port.onMessage.addListener(function (m) { if (m && m.type === 'close-panel') window.close(); });
      // Read lastError on disconnect so a transient "receiving end does not
      // exist" (SW restarting / dev reload) doesn't surface as an unchecked
      // runtime.lastError warning. The panel still works; the command falls
      // back to sidePanel.open() when no live port is registered.
      port.onDisconnect.addListener(function () { void chrome.runtime.lastError; });
      if (chrome.windows && chrome.windows.getCurrent) {
        chrome.windows.getCurrent(function (w) {
          if (chrome.runtime.lastError) return;
          try { if (w) port.postMessage({ type: 'hello', windowId: w.id }); } catch (e) {}
        });
      }
    } catch (e) { /* runtime unavailable */ }
  }

  start();

  // ── drag a file onto the side panel → open it in reading mode (reader tab) ──
  (function wireDropToReader() {
    const RE = /\.(md|markdown|txt|mdown|mkd)$/i;
    let ov = null;
    function overlay(show) {
      if (!ov) {
        ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(20,18,16,.6);backdrop-filter:blur(3px);font-family:system-ui,sans-serif;pointer-events:none;padding:16px;text-align:center;';
        const b = document.createElement('div');
        b.style.cssText = 'padding:18px 16px;border:2px dashed rgba(255,255,255,.7);border-radius:14px;color:#fff;font-size:14px;font-weight:600;';
        b.textContent = '松开以阅读';
        ov.appendChild(b);
        document.body.appendChild(ov);
      }
      ov.style.display = show ? 'flex' : 'none';
    }
    function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1; }
    window.addEventListener('dragenter', function (e) { if (hasFiles(e)) { e.preventDefault(); overlay(true); } });
    window.addEventListener('dragover', function (e) { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; overlay(true); } });
    window.addEventListener('dragleave', function (e) { if (e.relatedTarget === null) overlay(false); });
    window.addEventListener('drop', async function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); overlay(false);
      const list = Array.prototype.slice.call(e.dataTransfer.files || []);
      if (!list.length) return;
      const f = list.filter(function (x) { return RE.test(x.name); })[0] || list[0];
      let text = '';
      try { text = await f.text(); } catch (err) { return; }
      try { await window.MDStore.setDropDoc({ name: f.name || '拖入的文档', body: text }); window.MDStore.openReaderDrop(); } catch (err) {}
    });
  })();
})();
