/* MathDiagram.js — lazy-loaded math (KaTeX) & diagram (Mermaid) rendering.
   window.enhanceRendered(rootEl, themeId): finds .math-block / .math-inline /
   code[data-lang=mermaid] inside rootEl and renders them, fetching the heavy
   renderer ONLY on first use (with a visible loading placeholder).

   NOTE FOR PRODUCTION: in the real MV3 extension these libraries are BUNDLED
   locally and dynamically imported on demand (remote code is disallowed) — the
   CDN fetch + artificial delay below only simulate that first-load moment. */
(function () {
  const KATEX_JS = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
  const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
  const MERMAID_JS = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
  const FIRST_LOAD_MS = 550; // simulate reading the lazy chunk into memory

  const loaders = {};
  let mmCount = 0;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function ensureKaTeX() {
    if (!loaders.katex) {
      loaders.katex = (async function () {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = KATEX_CSS; document.head.appendChild(l);
        await loadScript(KATEX_JS);
        await new Promise(function (r) { setTimeout(r, FIRST_LOAD_MS); });
      })();
    }
    return loaders.katex;
  }
  function ensureMermaid() {
    if (!loaders.mermaid) {
      loaders.mermaid = (async function () {
        await loadScript(MERMAID_JS);
        window.mermaid.initialize(Object.assign({ startOnLoad: false, securityLevel: 'loose' }, themeConfig(_mmTheme || 'paper')));
        await new Promise(function (r) { setTimeout(r, FIRST_LOAD_MS); });
      })();
    }
    return loaders.mermaid;
  }

  // build mermaid config matching a Zedown theme so rendered diagrams look on-brand
  let _mmTheme = null;
  function themeConfig(themeId) {
    const T = (window.MD_TOKENS || {})[themeId] || (window.MD_TOKENS || {}).paper || {};
    return {
      theme: 'base',
      fontFamily: T.fontUI || 'system-ui, sans-serif',
      themeVariables: {
        fontFamily: T.fontUI || 'system-ui, sans-serif',
        fontSize: '14px',
        background: T.surface || '#fff',
        primaryColor: T.surface2 || '#f3eee3',
        primaryTextColor: T.text || '#2b2722',
        primaryBorderColor: T.borderStrong || '#d4cab4',
        secondaryColor: T.surface2 || '#f3eee3',
        tertiaryColor: T.surface || '#fff',
        mainBkg: T.surface2 || '#f3eee3',
        nodeBorder: T.borderStrong || '#d4cab4',
        clusterBkg: T.surface || '#fff',
        clusterBorder: T.border || '#e2dac9',
        lineColor: T.muted || '#8a8275',
        textColor: T.text || '#2b2722',
        titleColor: T.text || '#2b2722',
        edgeLabelBackground: T.surface || '#fff',
        labelBackground: T.surface || '#fff',
        // sequence
        actorBkg: T.surface2 || '#f3eee3', actorBorder: T.borderStrong || '#d4cab4',
        actorTextColor: T.text || '#2b2722', actorLineColor: T.muted || '#8a8275',
        signalColor: T.muted || '#8a8275', signalTextColor: T.text || '#2b2722',
        labelBoxBkgColor: T.surface || '#fff', labelBoxBorderColor: T.border || '#e2dac9', labelTextColor: T.text || '#2b2722',
        noteBkgColor: T.codeBg || '#f1ebdd', noteBorderColor: T.border || '#e2dac9', noteTextColor: T.text || '#2b2722',
        // state
        // pie
        pie1: '#e2792f', pie2: '#2f8a6b', pie3: '#4f6bd6', pie4: '#c2497a',
        pie5: '#9a6bd6', pie6: '#c9a227', pie7: '#5aaecb', pie8: '#8a8a8a',
        pieTitleTextSize: '15px', pieSectionTextSize: '12px', pieStrokeColor: T.surface || '#fff',
        // gantt
        taskBkgColor: T.surface2 || '#f3eee3', taskBorderColor: T.borderStrong || '#d4cab4',
        taskTextColor: T.text || '#2b2722', taskTextOutsideColor: T.text || '#2b2722',
        activeTaskBkgColor: T.codeText || '#7a4a2e', activeTaskBorderColor: T.muted || '#8a8275',
        doneTaskBkgColor: T.borderStrong || '#d4cab4', doneTaskBorderColor: T.muted || '#8a8275',
        sectionBkgColor: T.surface || '#fff', altSectionBkgColor: T.surface2 || '#f3eee3',
        gridColor: T.border || '#e2dac9',
      },
    };
  }
  function applyTheme(themeId) {
    if (!window.mermaid || !themeId || themeId === _mmTheme) return;
    try { window.mermaid.initialize(Object.assign({ startOnLoad: false, securityLevel: 'loose' }, themeConfig(themeId))); _mmTheme = themeId; } catch (e) {}
  }

  function lazyTag(text) {
    return '<span class="md-lazy"><span class="md-lazy-dot"></span>' + text + '</span>';
  }
  function errTag(msg) {
    return '<div class="md-diagram-err"><span class="md-diagram-err-h">⚠ 图表语法有误</span>'
      + '<span class="md-diagram-err-m">' + String(msg || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').slice(0, 200) + '</span></div>';
  }

  async function enhance(root, themeId) {
    if (!root || !root.querySelectorAll) return;

    // ---- inline math ----
    const inlines = Array.prototype.slice.call(root.querySelectorAll('.math-inline:not([data-done])'));
    // ---- block math ----
    const blocks = Array.prototype.slice.call(root.querySelectorAll('.math-block:not([data-done])'));
    if (inlines.length || blocks.length) {
      blocks.forEach(function (el) { el.innerHTML = lazyTag('加载公式渲染器…'); });
      inlines.forEach(function (el) { if (!el.textContent) el.textContent = el.dataset.tex; });
      try {
        await ensureKaTeX();
        blocks.forEach(function (el) {
          el.innerHTML = '';
          try { window.katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); }
          catch (e) { el.textContent = el.dataset.tex; }
          el.dataset.done = '1';
        });
        inlines.forEach(function (el) {
          el.textContent = '';
          try { window.katex.render(el.dataset.tex, el, { displayMode: false, throwOnError: false }); }
          catch (e) { el.textContent = el.dataset.tex; }
          el.dataset.done = '1';
        });
      } catch (e) { /* offline: leave raw tex */ }
    }

    // ---- mermaid diagrams ----
    if (themeId && !_mmTheme) _mmTheme = themeId;
    const codes = Array.prototype.slice.call(root.querySelectorAll('code[data-lang="mermaid"]'))
      .map(function (c) { return c.closest('pre'); })
      .filter(function (pre) { return pre && (!pre.dataset.mmdDone || pre.dataset.mmdTheme !== (themeId || _mmTheme)); });
    if (codes.length) {
      const jobs = codes.map(function (pre) {
        const code = pre.dataset.mmdSrc || pre.textContent;
        pre.dataset.mmdSrc = code;
        pre.dataset.mmdDone = '1';
        pre.dataset.mmdTheme = themeId || _mmTheme || 'paper';
        pre.className = 'mermaid-host';
        pre.innerHTML = lazyTag('加载图表渲染器…');
        return { pre: pre, code: code };
      });
      try {
        await ensureMermaid();
        applyTheme(themeId);
        for (let k = 0; k < jobs.length; k++) {
          const id = 'mmd-' + (++mmCount) + '-' + Date.now();
          try {
            const out = await window.mermaid.render(id, jobs[k].code);
            jobs[k].pre.innerHTML = '<div class="mermaid-rendered">' + out.svg + '</div>';
          } catch (e) {
            jobs[k].pre.innerHTML = errTag(e && e.message ? e.message : e);
          }
          const orphan = document.getElementById('d' + id) || document.getElementById(id);
          if (orphan && orphan.parentElement === document.body) orphan.remove();
        }
      } catch (e) { /* offline */ }
    }

    // ---- zdiagram blocks (editable visual-studio graphs, rendered exactly) ----
    injectZdCss();
    const T = (window.MD_TOKENS || {})[themeId] || (window.MD_TOKENS || {}).paper || {};
    const zds = Array.prototype.slice.call(root.querySelectorAll('code[data-lang="zdiagram"]'))
      .map(function (c) { return c.closest('pre'); })
      .filter(function (pre) { return pre && (!pre.dataset.zdDone || pre.dataset.zdTheme !== (themeId || 'paper')); });
    zds.forEach(function (pre) {
      const json = pre.dataset.zdSrc || pre.textContent;
      pre.dataset.zdSrc = json;
      pre.dataset.zdDone = '1';
      pre.dataset.zdTheme = themeId || 'paper';
      let svg = '';
      try { svg = window.VS_graphToSVG ? window.VS_graphToSVG(JSON.parse(json), T) : ''; } catch (e) { svg = ''; }
      pre.className = 'zd-fig';
      pre.innerHTML = '<div class="zd-svg">' + svg + '</div>';
    });
  }

  let _zdCss = false;
  function injectZdCss() {
    if (_zdCss) return; _zdCss = true;
    const s = document.createElement('style');
    s.textContent = '.zd-fig{position:relative;background:none!important;border:none!important;padding:0!important;margin:1em 0;display:inline-block;max-width:100%;}'
      + '.zd-svg svg{max-width:100%;height:auto;border-radius:8px;}';
    document.head.appendChild(s);
  }

  window.enhanceRendered = enhance;

  // direct render helper for the visual studio's live preview
  window.MD_renderMermaid = async function (code, themeId) {
    await ensureMermaid();
    applyTheme(themeId);
    const id = 'mmd-live-' + (++mmCount) + '-' + Date.now();
    try {
      const out = await window.mermaid.render(id, code);
      return { ok: true, svg: out.svg };
    } catch (e) {
      const orphan = document.getElementById('d' + id) || document.getElementById(id);
      if (orphan && orphan.parentElement === document.body) orphan.remove();
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  };
})();
