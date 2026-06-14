/* enhance.js — progressive DOM enhancements for rendered .prose markdown.
   Exposes globalThis.MDEnhance = { codeCopyButtons(proseEl), headingAnchors(proseEl) }.
   Pure DOM. No MDStore, no theme tokens. Neutral inherited styles so it
   reads on any theme. Idempotent (safe to call repeatedly). */
(function () {
  function slugify(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w一-龥\- ]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
  }

  function codeCopyButtons(proseEl) {
    if (!proseEl || !proseEl.querySelectorAll) return;
    const pres = proseEl.querySelectorAll('pre');
    for (let i = 0; i < pres.length; i++) {
      const pre = pres[i];
      if (pre.dataset.mdCopy === '1') continue;
      const code = pre.querySelector('code');
      if (!code) continue;
      pre.dataset.mdCopy = '1';
      if (getComputedStyle(pre).position === 'static') pre.style.position = 'relative';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'md-copy-btn';
      btn.textContent = '复制';
      btn.setAttribute('aria-label', '复制代码');
      btn.addEventListener('click', function () {
        const text = code.textContent;
        const done = function () {
          btn.textContent = '已复制';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = '复制';
            btn.classList.remove('copied');
          }, 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () {
            fallbackCopy(text); done();
          });
        } else {
          fallbackCopy(text); done();
        }
      });
      pre.appendChild(btn);
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { /* noop */ }
  }

  function headingAnchors(proseEl) {
    if (!proseEl || !proseEl.querySelectorAll) return;
    const heads = proseEl.querySelectorAll('h1, h2, h3');
    const seen = {};
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i];
      if (!h.id) {
        let base = slugify(h.textContent);
        let id = base;
        let k = 1;
        while (seen[id] || document.getElementById(id)) { id = base + '-' + (k++); }
        h.id = id;
      }
      seen[h.id] = true;
      if (h.dataset.mdAnchor === '1') continue;
      h.dataset.mdAnchor = '1';

      const a = document.createElement('a');
      a.className = 'md-anchor';
      a.href = '#' + h.id;
      a.textContent = '#';
      a.setAttribute('aria-label', '锚点链接');
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        const url = location.href.split('#')[0] + '#' + h.id;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {}, function () {});
        }
        try { location.hash = h.id; } catch (e) { /* noop */ }
      });
      h.appendChild(a);
    }
  }

  // --- mermaid rendering ---------------------------------------------------
  // Unique id source (no Math.random at module top — deterministic counter).
  let mermaidSeq = 0;
  // Track the theme mermaid was last initialized with, so we re-init on change.
  let mermaidInitTheme = null;

  function mermaidThemeFor(themeId) {
    return themeId === 'midnight' ? 'dark' : 'default';
  }

  function ensureMermaidInit(themeId) {
    const m = globalThis.mermaid;
    if (!m || typeof m.initialize !== 'function') return false;
    const wantTheme = mermaidThemeFor(themeId);
    if (mermaidInitTheme !== wantTheme) {
      try {
        m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: wantTheme });
        mermaidInitTheme = wantTheme;
      } catch (e) { /* noop */ }
    }
    return true;
  }

  // renderMermaid(proseEl, themeId): render each unprocessed .md-mermaid to SVG.
  // Idempotent (dataset flag), never throws (all paths caught), no-op when
  // mermaid is absent. Keeps the <pre> fallback + adds .md-mermaid-error on
  // failure.
  function renderMermaid(proseEl, themeId) {
    try {
      if (!proseEl || !proseEl.querySelectorAll) return;
      const m = globalThis.mermaid;
      if (!m || typeof m.render !== 'function') return; // guard: no mermaid
      ensureMermaidInit(themeId);

      const nodes = proseEl.querySelectorAll('.md-mermaid');
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.dataset.mdMermaid === '1') continue; // already processed
        node.dataset.mdMermaid = '1';
        const src = node.getAttribute('data-mermaid') || '';
        if (!src.trim()) continue;
        const id = 'mmd-' + (++mermaidSeq);

        // mermaid.render may return a Promise (v10+) or invoke a callback.
        let result;
        try {
          result = m.render(id, src);
        } catch (errSync) {
          markMermaidError(node);
          continue;
        }
        if (result && typeof result.then === 'function') {
          result.then(function (out) {
            applyMermaidSvg(node, out && out.svg ? out.svg : out);
          }, function () {
            markMermaidError(node);
          });
        } else if (typeof result === 'string') {
          applyMermaidSvg(node, result);
        }
      }
    } catch (e) { /* never throw out of renderMermaid */ }
  }

  function applyMermaidSvg(node, svg) {
    try {
      if (!svg) { markMermaidError(node); return; }
      node.innerHTML = svg; // mermaid SVG output is trusted markup
      node.dataset.rendered = '1';
      node.classList.remove('md-mermaid-error');
    } catch (e) { markMermaidError(node); }
  }

  function markMermaidError(node) {
    try { node.classList.add('md-mermaid-error'); } catch (e) { /* noop */ }
    // keep the <pre class="md-mermaid-src"> fallback in place
  }

  globalThis.MDEnhance = {
    codeCopyButtons: codeCopyButtons,
    headingAnchors: headingAnchors,
    renderMermaid: renderMermaid,
  };
})();
