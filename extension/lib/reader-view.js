/* reader-view.js — reusable read-only Markdown reader view.
   window.MDReaderView(container, opts) mounts the reader UI into `container`
   (clearing it first) and returns a handle { destroy(), setTheme(id) }.

   Pure view: it never touches MDStore and never reads the URL. All data and
   callbacks come via opts so the full editor can reuse it for its 'read' mode.

   opts = {
     themeId,            // 'paper' | 'midnight' | 'indigo'
     content,            // markdown string
     title,              // document title
     onEdit,             // optional cb -> shows the 编辑 button
     editLabel,          // optional label for that button (default '编辑')
     editTitle,          // optional tooltip for that button
     onTheme,            // optional cb(id) -> shows the 3 theme dots
   }
*/
(function () {
  const T = window.MD_TOKENS;

  // tiny DOM helper
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
        } else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          el.setAttribute(k, v);
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

  function slug(s, i) {
    return 'h-' + i + '-' + (s || '').replace(/[^\w一-龥]+/g, '-').slice(0, 24);
  }

  function readerBtnStyle(t, fs) {
    return {
      border: 'none', background: 'transparent', cursor: 'pointer', color: t.muted,
      fontFamily: t.fontUI, fontWeight: '600', fontSize: fs + 'px',
      padding: '3px 8px', borderRadius: (t.radius - 4) + 'px', lineHeight: '1',
    };
  }

  function MDReaderView(container, opts) {
    opts = opts || {};
    let themeId = opts.themeId || 'paper';
    const src = opts.content != null ? opts.content : window.MD_SAMPLE.ARTICLE;
    const title = opts.title || '排版指南.md';
    const onEdit = opts.onEdit;
    const onTheme = opts.onTheme;
    const html = window.mdToHtml(src);

    let scale = 1;       // prose font-size scale (0.85..1.4)
    let activeId = null; // active TOC heading id
    // V3: collapsible TOC rail, persisted in localStorage['mdkit:toc'] ('1'/'0').
    let tocOpen = (function () {
      try { return localStorage.getItem('mdkit:toc') !== '0'; } catch (e) { return true; }
    })();

    // ── element refs (assigned during build) ──
    let root, progressFill, prose, scrollEl, tocWrap, reopenTab;
    const tocRows = []; // { id, level, el }

    function persistToc() {
      try { localStorage.setItem('mdkit:toc', tocOpen ? '1' : '0'); } catch (e) {}
    }

    // V3: toggle the TOC rail open/closed and persist the preference.
    function toggleToc(force) {
      tocOpen = typeof force === 'boolean' ? force : !tocOpen;
      persistToc();
      if (tocWrap) tocWrap.style.display = tocOpen ? '' : 'none';
      if (reopenTab) reopenTab.style.display = tocOpen ? 'none' : '';
      if (tocToggleBtn) {
        const t = T[themeId];
        tocToggleBtn.title = tocOpen ? '收起目录' : '展开目录';
        tocToggleBtn.style.border = '1px solid ' + (tocOpen ? t.borderStrong : t.border);
        tocToggleBtn.style.background = tocOpen ? t.surface : t.surface2;
        tocToggleBtn.style.color = tocOpen ? t.text : t.muted;
      }
      // Recompute scroll-spy after the rail toggles (layout/offsets unchanged
      // for the article column, but keep progress/active in sync).
      onScroll();
    }

    let tocToggleBtn = null;

    // ── build ──
    function build() {
      const t = T[themeId];

      progressFill = h('div', { style: {
        height: '100%', width: '0%', background: t.accent, transition: 'width .1s linear',
      } });
      const progressBar = h('div', { style: {
        height: '3px', background: t.border, flexShrink: '0',
      } }, progressFill);

      // top bar
      const brand = h('div', { style: {
        width: '24px', height: '24px', borderRadius: '7px', background: t.accent,
        color: t.accentText, display: 'grid', placeItems: 'center',
        fontFamily: t.fontMono, fontWeight: '800', fontSize: '12px',
      } }, 'Z');

      const titleEl = h('div', { style: {
        fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      } }, title);
      const titleWrap = h('div', { style: { minWidth: '0', flex: '1' } }, titleEl);

      const pill = h('span', { style: {
        fontSize: '11px', fontWeight: '700', letterSpacing: '.04em',
        padding: '3px 9px', borderRadius: '20px', color: t.muted,
        background: t.surface, border: '1px solid ' + t.border,
      } }, '只读');

      // V3: TOC collapse/expand toggle (hamburger), leftmost in the top bar.
      const tocIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      tocIcon.setAttribute('width', '14');
      tocIcon.setAttribute('height', '12');
      tocIcon.setAttribute('viewBox', '0 0 14 12');
      tocIcon.setAttribute('fill', 'none');
      tocIcon.setAttribute('stroke', 'currentColor');
      tocIcon.setAttribute('stroke-width', '1.6');
      tocIcon.setAttribute('stroke-linecap', 'round');
      const tocPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tocPath.setAttribute('d', 'M1 1h12M1 6h12M1 11h7');
      tocIcon.appendChild(tocPath);
      tocToggleBtn = h('button', {
        title: tocOpen ? '收起目录' : '展开目录',
        onClick: function () { toggleToc(); },
        style: {
          width: '30px', height: '30px', display: 'grid', placeItems: 'center',
          cursor: 'pointer', flexShrink: '0',
          border: '1px solid ' + (tocOpen ? t.borderStrong : t.border),
          borderRadius: (t.radius - 2) + 'px',
          background: tocOpen ? t.surface : t.surface2,
          color: tocOpen ? t.text : t.muted,
        },
      }, tocIcon);

      const topChildren = [tocToggleBtn, brand, titleWrap, pill];

      if (onEdit) {
        const editBtn = h('button', {
          title: opts.editTitle || '在读写编辑器中打开',
          onClick: function () { onEdit(); },
          style: {
            border: 'none', background: t.accent, color: t.accentText, cursor: 'pointer',
            borderRadius: t.radius + 'px', padding: '7px 14px', fontSize: '12.5px',
            fontWeight: '700', fontFamily: t.fontUI, display: 'flex',
            alignItems: 'center', gap: '6px',
          },
        }, h('span', { style: { fontSize: '13px' } }, '✎'), ' ' + (opts.editLabel || '编辑'));
        topChildren.push(editBtn);
      }

      // font-size stepper
      const minus = h('button', {
        onClick: function () { setScale(Math.max(0.85, +(scale - 0.1).toFixed(2))); },
        style: readerBtnStyle(t, 13),
      }, 'A−');
      const plus = h('button', {
        onClick: function () { setScale(Math.min(1.4, +(scale + 0.1).toFixed(2))); },
        style: readerBtnStyle(t, 16),
      }, 'A+');
      const stepper = h('div', { style: {
        display: 'flex', alignItems: 'center', gap: '2px', padding: '3px',
        borderRadius: t.radius + 'px', background: t.surface, border: '1px solid ' + t.border,
      } }, minus, plus);
      topChildren.push(stepper);

      // theme dots
      if (onTheme) {
        const dots = window.MD_THEMES.map(function (th) {
          return h('button', {
            title: th.label,
            onClick: function () { onTheme(th.id); },
            style: {
              width: '17px', height: '17px', borderRadius: '50%', cursor: 'pointer',
              padding: '0', background: T[th.id].accent,
              border: '2px solid ' + (th.id === themeId ? t.text : 'transparent'),
              outline: '1px solid ' + t.border,
            },
          });
        });
        topChildren.push(h('div', { style: {
          display: 'flex', alignItems: 'center', gap: '7px',
        } }, ...dots));
      }

      const topBar = h('div', { style: {
        display: 'flex', alignItems: 'center', gap: '12px', padding: '0 22px',
        height: '54px', flexShrink: '0', borderBottom: '1px solid ' + t.border,
        background: t.surface2,
      } }, ...topChildren);

      // TOC rail (V3: collapsible). Header shows "目录" + a « collapse affordance.
      const tocCollapse = h('button', {
        title: '收起目录',
        onClick: function () { toggleToc(false); },
        style: {
          border: 'none', background: 'transparent', cursor: 'pointer',
          color: t.faint, fontSize: '14px', lineHeight: '1', padding: '2px',
        },
      }, '«');
      const tocHeader = h('div', { style: {
        display: 'flex', alignItems: 'center', marginBottom: '14px',
      } }, h('span', { style: {
        flex: '1', fontSize: '11px', fontWeight: '700', letterSpacing: '.1em',
        color: t.faint, textTransform: 'uppercase',
      } }, '目录'), tocCollapse);
      tocWrap = h('div', { style: {
        width: '232px', flexShrink: '0', borderRight: '1px solid ' + t.border,
        background: t.surface2, padding: '26px 20px', overflow: 'auto',
        display: tocOpen ? '' : 'none',
      } }, tocHeader);

      // V3: slim reopen affordance shown when the TOC is collapsed.
      reopenTab = h('button', {
        title: '展开目录',
        onClick: function () { toggleToc(true); },
        style: {
          width: '24px', flexShrink: '0', border: 'none',
          borderRight: '1px solid ' + t.border, background: t.surface2,
          color: t.muted, cursor: 'pointer', writingMode: 'vertical-rl',
          fontSize: '11px', fontWeight: '700', letterSpacing: '.1em',
          padding: '12px 0', display: tocOpen ? 'none' : 'flex',
          alignItems: 'center', justifyContent: 'center',
        },
      }, '目录 »');

      // article
      prose = h('div', { class: 'prose', style: {
        maxWidth: 'none', margin: '0', padding: '48px 64px 120px',
        fontSize: (16 * scale) + 'px',
      } });
      prose.innerHTML = html;

      scrollEl = h('div', {
        onScroll: onScroll,
        style: { flex: '1', minWidth: '0', overflow: 'auto' },
      }, prose);

      const body = h('div', { style: {
        flex: '1', minHeight: '0', display: 'flex',
      } }, reopenTab, tocWrap, scrollEl);

      root = h('div', {
        class: 'theme-' + themeId,
        style: {
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: t.surface, fontFamily: t.fontUI, color: t.text, position: 'relative',
        },
      }, progressBar, topBar, body);

      container.appendChild(root);

      buildToc();

      // Progressive enhancements (V2). Run AFTER buildToc so the reader's TOC
      // id scheme (slug() ids assigned in buildToc) already exists: MDEnhance
      // .headingAnchors is idempotent and only adds ids where missing, so it
      // leaves the TOC ids untouched and just appends the hover "#" anchor.
      // codeCopyButtons adds per-block 复制 buttons styled via theme token CSS.
      if (window.MDEnhance) {
        window.MDEnhance.codeCopyButtons(prose);
        window.MDEnhance.headingAnchors(prose);
        // V2.1: render mermaid diagrams with the current theme. setTheme()
        // rebuilds the whole view, so this re-runs with the right themeId on
        // every theme switch. KaTeX math is already final HTML from md.js.
        window.MDEnhance.renderMermaid(prose, themeId);
      }

      // initial progress / active calc
      requestAnimationFrame(onScroll);
    }

    // build TOC from rendered headings; assign ids
    function buildToc() {
      tocRows.length = 0;
      const t = T[themeId];
      const hs = Array.prototype.slice.call(prose.querySelectorAll('h1, h2, h3'));
      hs.forEach(function (el, i) {
        const id = slug(el.textContent, i);
        el.id = id;
        const level = Number(el.tagName[1]);
        const row = h('div', {
          onClick: function () { jump(id); },
          style: {
            cursor: 'pointer', fontSize: '13px', lineHeight: '1.5', padding: '5px 0',
            paddingLeft: ((level - 1) * 13) + 'px', color: t.muted, fontWeight: '400',
            borderLeft: '2px solid transparent', marginLeft: '-20px',
            transition: 'color .12s',
          },
        }, h('span', { style: { marginLeft: '18px' } }, el.textContent));
        tocWrap.appendChild(row);
        tocRows.push({ id: id, level: level, el: row });
      });
      activeId = tocRows[0] ? tocRows[0].id : null;
      paintActive();
    }

    function paintActive() {
      const t = T[themeId];
      tocRows.forEach(function (r) {
        const on = r.id === activeId;
        r.el.style.color = on ? t.text : t.muted;
        r.el.style.fontWeight = on ? '600' : '400';
        r.el.style.borderLeft = '2px solid ' + (on ? t.accent : 'transparent');
      });
    }

    function onScroll() {
      if (!scrollEl || !prose) return;
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      const p = max > 0 ? Math.min(1, scrollEl.scrollTop / max) : 1;
      progressFill.style.width = (p * 100) + '%';
      // active heading = last one above the 28% line
      const line = scrollEl.scrollTop + scrollEl.clientHeight * 0.28;
      let cur = null;
      prose.querySelectorAll('h1, h2, h3').forEach(function (el) {
        if (el.offsetTop <= line) cur = el.id;
      });
      if (cur && cur !== activeId) { activeId = cur; paintActive(); }
    }

    function jump(id) {
      const el = document.getElementById(id);
      if (scrollEl && el) scrollEl.scrollTo({ top: el.offsetTop - 28, behavior: 'smooth' });
    }

    function setScale(s) {
      scale = s;
      if (prose) prose.style.fontSize = (16 * scale) + 'px';
      onScroll();
    }

    function setTheme(id) {
      if (!T[id]) return;
      themeId = id;
      // Preserve the reader's A−/A+ font-size adjustment across theme switches,
      // matching the prototype (scale is independent of theme).
      container.textContent = '';
      build();
    }

    function destroy() {
      container.textContent = '';
      root = null;
    }

    container.textContent = '';
    build();

    return { destroy: destroy, setTheme: setTheme };
  }

  window.MDReaderView = MDReaderView;
})();
