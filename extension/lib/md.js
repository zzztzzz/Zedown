/* md.js — compact, dependency-free Markdown → HTML renderer.
   Exposes window.mdToHtml(src). Supports: ATX headings, fenced & indented
   code, blockquotes, ordered/unordered/task lists (nested), tables, hr,
   inline code, bold/italic/strike, links, images, autolinks. Good enough
   for a prototype; not a spec-complete CommonMark engine. */
(function () {
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(s) {
    return esc(s).replace(/"/g, '&quot;');
  }
  // CSS.escape-ish for use in id attributes / selectors (safe subset).
  function escId(s) {
    return String(s).replace(/[^\w-]/g, function (ch) {
      return '_' + ch.charCodeAt(0).toString(16) + '_';
    });
  }

  // --- footnote context (active only during the outermost mdToHtml call) ---
  // fnCtx = { defs:{id:html}, order:[id...], seen:{id:number} } or null.
  let fnCtx = null;

  // Render TeX via KaTeX when present; KaTeX output is trusted HTML and must
  // NOT be re-escaped. On absence or error, fall back to the escaped literal.
  function renderMath(tex, display) {
    const kx = globalThis.katex;
    if (!kx || typeof kx.renderToString !== 'function') {
      // KaTeX absent: leave the raw text escaped (keep delimiters readable).
      return esc((display ? '$$' : '$') + tex + (display ? '$$' : '$'));
    }
    try {
      return kx.renderToString(tex, { displayMode: !!display, throwOnError: false });
    } catch (e) {
      return esc((display ? '$$' : '$') + tex + (display ? '$$' : '$'));
    }
  }

  // --- inline ---
  function inline(text) {
    let out = '';
    let i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      // literal escaped dollar  \$  → a plain dollar sign (never math)
      if (c === '\\' && text[i + 1] === '$') {
        out += '$';
        i += 2;
        continue;
      }
      // inline math  $…$  (handled BEFORE emphasis/code so TeX _ * \ survive).
      // Skip $$ (display handled at block level). Opening $ must not be
      // followed by whitespace; closing $ must not be preceded by whitespace.
      if (c === '$' && text[i + 1] !== '$') {
        const after = text[i + 1];
        if (after !== undefined && after !== ' ' && after !== '\t') {
          let j = i + 1;
          let found = -1;
          while (j < n) {
            const cj = text[j];
            if (cj === '\\') { j += 2; continue; }
            if (cj === '$') {
              const prev = text[j - 1];
              if (prev !== ' ' && prev !== '\t' && text[j + 1] !== '$') { found = j; }
              break;
            }
            j++;
          }
          if (found > i + 1) {
            out += renderMath(text.slice(i + 1, found), false);
            i = found + 1;
            continue;
          }
        }
      }
      // inline code
      if (c === '`') {
        let j = i + 1;
        while (j < n && text[j] !== '`') j++;
        if (j < n) {
          out += '<code>' + esc(text.slice(i + 1, j)) + '</code>';
          i = j + 1;
          continue;
        }
      }
      // image ![alt](url)
      if (c === '!' && text[i + 1] === '[') {
        const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(text.slice(i));
        if (m) {
          out += '<img src="' + escAttr(m[2]) + '" alt="' + escAttr(m[1]) + '"'
            + (m[3] ? ' title="' + escAttr(m[3]) + '"' : '') + '>';
          i += m[0].length;
          continue;
        }
      }
      // footnote reference [^id]
      if (c === '[' && text[i + 1] === '^') {
        const fm = /^\[\^([^\]]+)\]/.exec(text.slice(i));
        if (fm && fnCtx) {
          const id = fm[1].trim();
          let num = fnCtx.seen[id];
          if (!num) {
            fnCtx.order.push(id);
            num = fnCtx.order.length;
            fnCtx.seen[id] = num;
          }
          const eid = escId(id);
          out += '<sup class="fn-ref" id="fnref-' + eid + '">'
            + '<a href="#fn-' + eid + '">[' + num + ']</a></sup>';
          i += fm[0].length;
          continue;
        }
      }
      // link [text](url)
      if (c === '[') {
        const m = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(text.slice(i));
        if (m) {
          out += '<a href="' + escAttr(m[2]) + '"'
            + (m[3] ? ' title="' + escAttr(m[3]) + '"' : '')
            + ' target="_blank" rel="noopener">' + inline(m[1]) + '</a>';
          i += m[0].length;
          continue;
        }
      }
      // bold **x** or __x__
      if ((c === '*' && text[i + 1] === '*') || (c === '_' && text[i + 1] === '_')) {
        const marker = c + c;
        const end = text.indexOf(marker, i + 2);
        if (end > -1) {
          out += '<strong>' + inline(text.slice(i + 2, end)) + '</strong>';
          i = end + 2;
          continue;
        }
      }
      // strikethrough ~~x~~
      if (c === '~' && text[i + 1] === '~') {
        const end = text.indexOf('~~', i + 2);
        if (end > -1) {
          out += '<del>' + inline(text.slice(i + 2, end)) + '</del>';
          i = end + 2;
          continue;
        }
      }
      // italic *x* or _x_
      if (c === '*' || c === '_') {
        const end = text.indexOf(c, i + 1);
        if (end > i + 1 && text[i + 1] !== ' ') {
          out += '<em>' + inline(text.slice(i + 1, end)) + '</em>';
          i = end + 1;
          continue;
        }
      }
      // raw autolink
      if (c === 'h' && /^https?:\/\/[^\s<]+/.test(text.slice(i))) {
        const m = /^https?:\/\/[^\s<]+/.exec(text.slice(i));
        out += '<a href="' + escAttr(m[0]) + '" target="_blank" rel="noopener">' + esc(m[0]) + '</a>';
        i += m[0].length;
        continue;
      }
      out += esc(c);
      i++;
    }
    return out;
  }

  function tableRow(line) {
    return line.replace(/^\||\|$/g, '').split('|').map(function (s) { return s.trim(); });
  }

  // --- block ---
  function render(src) {
    if (!src) return '';
    const lines = src.replace(/\r\n/g, '\n').replace(/\t/g, '    ').split('\n');
    let html = '';
    let i = 0;
    const N = lines.length;

    function parseList(indent, ordered) {
      let out = ordered ? '<ol>' : '<ul>';
      const re = ordered ? /^(\s*)\d+\.\s+(.*)$/ : /^(\s*)[-*+]\s+(.*)$/;
      while (i < N) {
        const m = re.exec(lines[i]);
        if (!m || m[1].length < indent) break;
        if (m[1].length > indent) break;
        let content = m[2];
        // task list
        let task = '';
        const tm = /^\[([ xX])\]\s+(.*)$/.exec(content);
        if (tm) {
          task = '<input type="checkbox" disabled' + (tm[1] !== ' ' ? ' checked' : '') + '> ';
          content = tm[2];
        }
        i++;
        // gather nested
        let nested = '';
        while (i < N) {
          const nm = /^(\s*)([-*+]|\d+\.)\s+/.exec(lines[i]);
          if (nm && nm[1].length > indent) {
            nested += parseList(nm[1].length, /\d+\./.test(nm[2]));
          } else break;
        }
        out += '<li' + (task ? ' class="task"' : '') + '>' + task + inline(content) + nested + '</li>';
      }
      out += ordered ? '</ol>' : '</ul>';
      return out;
    }

    while (i < N) {
      let line = lines[i];

      // blank
      if (/^\s*$/.test(line)) { i++; continue; }

      // footnote definition  [^id]: text (may continue on indented lines)
      const fdef = fnCtx && /^\[\^([^\]]+)\]:\s?(.*)$/.exec(line);
      if (fdef) {
        const id = fdef[1].trim();
        let buf = fdef[2];
        i++;
        while (i < N && !/^\s*$/.test(lines[i])
          && !/^\[\^[^\]]+\]:/.test(lines[i])
          && /^(\s{2,}|\t)/.test(lines[i])) {
          buf += '\n' + lines[i].replace(/^\s+/, '');
          i++;
        }
        fnCtx.defs[id] = inline(buf.trim());
        continue;
      }

      // display math block  $$ … $$  (own block, may span lines; TeX never
      // passes through markdown inline). Opening $$ may have trailing TeX on
      // the same line; closing $$ ends the block.
      const dmOpen = /^\s*\$\$(.*)$/.exec(line);
      if (dmOpen) {
        // single-line form:  $$ tex $$
        const single = /^\s*\$\$(.+?)\$\$\s*$/.exec(line);
        if (single) {
          html += '<div class="md-math-display">' + renderMath(single[1].trim(), true) + '</div>';
          i++;
          continue;
        }
        let tex = dmOpen[1];
        i++;
        let closed = false;
        while (i < N) {
          const cm = /^(.*?)\$\$\s*$/.exec(lines[i]);
          if (cm) {
            tex += (tex ? '\n' : '') + cm[1];
            i++;
            closed = true;
            break;
          }
          tex += (tex ? '\n' : '') + lines[i];
          i++;
        }
        if (closed) {
          html += '<div class="md-math-display">' + renderMath(tex.trim(), true) + '</div>';
          continue;
        }
        // unterminated — treat the opener as a normal paragraph line
        html += '<p>' + inline(line) + '</p>';
        continue;
      }

      // fenced code
      const fence = /^\s*```(.*)$/.exec(line);
      if (fence) {
        const lang = fence[1].trim();
        i++;
        let code = '';
        while (i < N && !/^\s*```\s*$/.test(lines[i])) { code += lines[i] + '\n'; i++; }
        i++;
        const raw = code.replace(/\n$/, '');
        // mermaid fenced block → placeholder for enhance.js to render to SVG.
        // Never syntax-highlighted; the <pre> is the visible fallback.
        if (lang.toLowerCase() === 'mermaid') {
          const escSrc = esc(raw);
          html += '<div class="md-mermaid" data-mermaid="' + escAttr(raw) + '">'
            + '<pre class="md-mermaid-src">' + escSrc + '</pre></div>';
          continue;
        }
        // zdiagram fenced block → placeholder for the Visual Diagram Studio
        // renderer (enhance.js → VS_graphToSVG). The <pre> is the visible
        // fallback (raw graph JSON) until the SVG renders.
        if (lang.toLowerCase() === 'zdiagram') {
          const escSrc = esc(raw);
          html += '<div class="md-zdiagram" data-zdiagram="' + escAttr(raw) + '">'
            + '<pre class="md-zdiagram-src">' + escSrc + '</pre></div>';
          continue;
        }
        let inner;
        if (lang && typeof globalThis.mdHighlight === 'function') {
          try { inner = globalThis.mdHighlight(raw, lang); }
          catch (e) { inner = esc(raw); }
        } else {
          inner = esc(raw);
        }
        html += '<pre><code' + (lang ? ' class="lang-' + escAttr(lang) + '" data-lang="' + escAttr(lang) + '"' : '') + '>'
          + inner + '</code></pre>';
        continue;
      }

      // heading
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        const lvl = h[1].length;
        html += '<h' + lvl + '>' + inline(h[2].replace(/\s+#+\s*$/, '')) + '</h' + lvl + '>';
        i++;
        continue;
      }

      // hr
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) { html += '<hr>'; i++; continue; }

      // blockquote
      if (/^\s*>/.test(line)) {
        let buf = '';
        while (i < N && /^\s*>/.test(lines[i])) {
          buf += lines[i].replace(/^\s*>\s?/, '') + '\n';
          i++;
        }
        html += '<blockquote>' + render(buf) + '</blockquote>';
        continue;
      }

      // table
      if (/\|/.test(line) && i + 1 < N && /^\s*\|?[\s:?-]+\|[\s:|?-]*$/.test(lines[i + 1])) {
        const header = tableRow(line);
        const align = tableRow(lines[i + 1]).map(function (s) {
          const l = s.startsWith(':'), r = s.endsWith(':');
          return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
        });
        i += 2;
        let body = '';
        while (i < N && /\|/.test(lines[i]) && !/^\s*$/.test(lines[i])) {
          const cells = tableRow(lines[i]);
          body += '<tr>' + cells.map(function (c, k) {
            return '<td' + (align[k] ? ' style="text-align:' + align[k] + '"' : '') + '>' + inline(c) + '</td>';
          }).join('') + '</tr>';
          i++;
        }
        html += '<table><thead><tr>' + header.map(function (c, k) {
          return '<th' + (align[k] ? ' style="text-align:' + align[k] + '"' : '') + '>' + inline(c) + '</th>';
        }).join('') + '</tr></thead><tbody>' + body + '</tbody></table>';
        continue;
      }

      // list
      const lm = /^(\s*)([-*+]|\d+\.)\s+/.exec(line);
      if (lm) {
        html += parseList(lm[1].length, /\d+\./.test(lm[2]));
        continue;
      }

      // paragraph (gather until blank / block start)
      let para = '';
      while (i < N && !/^\s*$/.test(lines[i])
        && !/^(#{1,6})\s/.test(lines[i])
        && !/^\s*```/.test(lines[i])
        && !/^\s*\$\$/.test(lines[i])
        && !/^\s*>/.test(lines[i])
        && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])
        && !/^\s*([-*_])\s*(\1\s*){2,}$/.test(lines[i])) {
        para += (para ? '\n' : '') + lines[i];
        i++;
      }
      // soft-wrap lines join with space; two trailing spaces = hard break
      const joined = para.split('\n').map(function (l, k, arr) {
        const hard = /  $/.test(l);
        return l.replace(/\s+$/, '') + (k < arr.length - 1 ? (hard ? '<br>' : ' ') : '');
      }).join('');
      html += '<p>' + inline(joined) + '</p>';
    }
    return html;
  }

  // Public entry: manages footnote context for one top-level document, then
  // appends the footnotes section (in order of first reference) if any.
  function mdToHtml(src) {
    if (!src) return '';
    const prev = fnCtx;
    fnCtx = { defs: {}, order: [], seen: {} };
    let html;
    try {
      html = render(src);
      if (fnCtx.order.length) {
        let items = '';
        for (let k = 0; k < fnCtx.order.length; k++) {
          const id = fnCtx.order[k];
          const eid = escId(id);
          const def = fnCtx.defs.hasOwnProperty(id) ? fnCtx.defs[id] : '';
          items += '<li id="fn-' + eid + '">' + def
            + ' <a href="#fnref-' + eid + '" class="fn-back">↩</a></li>';
        }
        html += '<section class="footnotes"><hr><ol>' + items + '</ol></section>';
      }
    } finally {
      fnCtx = prev;
    }
    return html;
  }

  globalThis.mdToHtml = mdToHtml;
})();
