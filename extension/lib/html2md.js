/* html2md.js — HTML → Markdown converter (vanilla, no deps).
   Exposes globalThis.htmlToMarkdown(htmlOrNode) -> markdown string.

   Accepts either an HTML string (parsed with DOMParser when available) or a
   live DOM node/Document. In a service worker there is no DOMParser, so the
   SW should NOT pass an HTML string here — page-side code converts to Markdown
   in the page instead (see background.js extractFn). This lib is primarily for
   contexts where DOMParser exists (window pages).

   Coverage: h1-6, p, br, strong/b, em/i, del/s, code, pre>code (fenced w/ lang),
   a[href], img[src,alt], ul/ol/li (nested), blockquote, hr, table (GFM).
   Strips script/style/nav/aside/header/footer/noscript noise. */
(function () {
  var BLOCK_NOISE = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, NAV: 1, ASIDE: 1, IFRAME: 1, SVG: 1, FORM: 1, TEMPLATE: 1 };

  function getRoot(input) {
    if (input == null) return null;
    // DOM node (Element / Document / DocumentFragment)
    if (typeof input === 'object' && input.nodeType) return input;
    // string → parse if DOMParser available
    if (typeof input === 'string') {
      if (typeof DOMParser !== 'undefined') {
        var doc = new DOMParser().parseFromString(input, 'text/html');
        return doc.body || doc;
      }
      // No DOMParser (e.g. service worker): cannot parse a raw string.
      throw new Error('htmlToMarkdown: DOMParser unavailable; pass a DOM node or convert in-page.');
    }
    return null;
  }

  function collapseWs(s) {
    return s.replace(/[ \t\r\n\f]+/g, ' ');
  }

  function escapeText(s) {
    // Escape Markdown-significant characters in inline text.
    return s.replace(/([\\`*_\[\]])/g, '\\$1');
  }

  function isBlock(node) {
    if (!node || node.nodeType !== 1) return false;
    switch (node.tagName) {
      case 'P': case 'DIV': case 'SECTION': case 'ARTICLE': case 'HEADER':
      case 'FOOTER': case 'MAIN': case 'UL': case 'OL': case 'LI': case 'TABLE':
      case 'BLOCKQUOTE': case 'PRE': case 'HR': case 'H1': case 'H2': case 'H3':
      case 'H4': case 'H5': case 'H6': case 'FIGURE': case 'FIGCAPTION':
        return true;
      default:
        return false;
    }
  }

  // --- inline rendering (within a block) ---
  function renderInline(node) {
    var out = '';
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) {
      out += inlineNode(kids[i]);
    }
    return out;
  }

  function inlineNode(node) {
    if (node.nodeType === 3) { // text
      return escapeText(collapseWs(node.nodeValue));
    }
    if (node.nodeType !== 1) return '';
    var tag = node.tagName;
    if (BLOCK_NOISE[tag]) return '';
    switch (tag) {
      case 'BR':
        return '  \n';
      case 'STRONG': case 'B': {
        var sb = renderInline(node).trim();
        return sb ? '**' + sb + '**' : '';
      }
      case 'EM': case 'I': {
        var se = renderInline(node).trim();
        return se ? '*' + se + '*' : '';
      }
      case 'DEL': case 'S': case 'STRIKE': {
        var sd = renderInline(node).trim();
        return sd ? '~~' + sd + '~~' : '';
      }
      case 'CODE': {
        // inline code (pre>code is handled at block level)
        var ct = node.textContent;
        // pick a fence of backticks longer than any run inside
        var run = (ct.match(/`+/g) || []).reduce(function (m, x) { return Math.max(m, x.length); }, 0);
        var fence = new Array(run + 2).join('`');
        var pad = /^`|`$/.test(ct) || run ? ' ' : '';
        return fence + pad + ct + pad + fence;
      }
      case 'A': {
        var href = node.getAttribute('href') || '';
        var at = renderInline(node).trim();
        if (!href || /^javascript:/i.test(href)) return at;
        if (!at) at = href;
        return '[' + at + '](' + href + ')';
      }
      case 'IMG': {
        var src = node.getAttribute('src') || '';
        var alt = node.getAttribute('alt') || '';
        if (!src) return '';
        return '![' + alt.replace(/\]/g, '') + '](' + src + ')';
      }
      case 'SPAN': case 'FONT': case 'U': case 'SUP': case 'SUB':
      case 'MARK': case 'SMALL': case 'ABBR': case 'CITE': case 'Q':
      case 'TIME': case 'LABEL': case 'BDI': case 'BDO': case 'WBR':
        return renderInline(node);
      default:
        // unknown inline-ish element: descend
        return renderInline(node);
    }
  }

  // --- block rendering ---
  function renderChildren(node, indent) {
    var parts = [];
    var kids = node.childNodes;
    var inlineBuf = '';
    function flushInline() {
      var t = inlineBuf.replace(/[ \t]+\n/g, '\n').trim();
      // keep hard breaks (two-space) — they were normalized already
      var raw = inlineBuf.trim();
      if (raw) parts.push(raw);
      inlineBuf = '';
    }
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 1 && BLOCK_NOISE[k.tagName]) continue;
      if (isBlock(k)) {
        flushInline();
        var b = renderBlock(k, indent);
        if (b) parts.push(b);
      } else {
        inlineBuf += inlineNode(k);
      }
    }
    flushInline();
    return parts;
  }

  function renderBlock(node, indent) {
    indent = indent || '';
    if (node.nodeType === 3) {
      var t = escapeText(collapseWs(node.nodeValue)).trim();
      return t;
    }
    if (node.nodeType !== 1) return '';
    var tag = node.tagName;
    if (BLOCK_NOISE[tag]) return '';

    switch (tag) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        var lvl = +tag[1];
        var ht = renderInline(node).trim();
        return ht ? new Array(lvl + 1).join('#') + ' ' + ht : '';
      }
      case 'HR':
        return '---';
      case 'PRE': {
        var codeEl = node.querySelector ? node.querySelector('code') : null;
        var lang = '';
        if (codeEl) {
          var cls = (codeEl.getAttribute('class') || '') + ' ' + (node.getAttribute('class') || '');
          var lm = /(?:^|\s)(?:language-|lang-)([A-Za-z0-9#+._-]+)/.exec(cls);
          if (lm) lang = lm[1];
        }
        var code = (codeEl ? codeEl.textContent : node.textContent) || '';
        code = code.replace(/\n+$/, '');
        var fence = '```';
        while (new RegExp('(^|\\n)' + fence + '(?!`)').test(code)) fence += '`';
        return fence + lang + '\n' + code + '\n' + fence;
      }
      case 'BLOCKQUOTE': {
        var inner = renderChildren(node, '').join('\n\n');
        if (!inner) return '';
        return inner.split('\n').map(function (l) { return l ? '> ' + l : '>'; }).join('\n');
      }
      case 'UL': case 'OL':
        return renderList(node, indent);
      case 'TABLE':
        return renderTable(node);
      case 'FIGURE': case 'FIGCAPTION':
      case 'DIV': case 'SECTION': case 'ARTICLE': case 'HEADER':
      case 'FOOTER': case 'MAIN': case 'P': default: {
        var parts = renderChildren(node, indent);
        return parts.join('\n\n');
      }
    }
  }

  function renderList(node, indent) {
    var ordered = node.tagName === 'OL';
    var startAttr = parseInt(node.getAttribute('start') || '1', 10);
    var n = isNaN(startAttr) ? 1 : startAttr;
    var lines = [];
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var li = kids[i];
      if (li.nodeType !== 1 || li.tagName !== 'LI') continue;
      var marker = ordered ? (n++ + '. ') : '- ';
      var childIndent = indent + new Array(marker.length + 1).join(' ');

      // Detect task-list checkbox.
      var task = '';
      var firstInput = li.querySelector ? li.querySelector('input[type=checkbox]') : null;
      if (firstInput && li.firstElementChild === firstInput || (firstInput && isFirstMeaningful(li, firstInput))) {
        task = firstInput.checked || firstInput.hasAttribute('checked') ? '[x] ' : '[ ] ';
      }

      var parts = renderChildren(li, childIndent);
      var body = parts.join('\n\n');
      if (task) body = task + body.replace(/^\s+/, '');
      if (!body) { lines.push(indent + marker.replace(/\s+$/, '')); continue; }

      var bodyLines = body.split('\n');
      var first = true;
      for (var b = 0; b < bodyLines.length; b++) {
        if (bodyLines[b] === '' ) { lines.push(''); continue; }
        if (first) { lines.push(indent + marker + bodyLines[b]); first = false; }
        else { lines.push(childIndent + bodyLines[b]); }
      }
    }
    return lines.join('\n');
  }

  function isFirstMeaningful(li, target) {
    var kids = li.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3 && !k.nodeValue.trim()) continue;
      return k === target;
    }
    return false;
  }

  function renderTable(node) {
    var rows = [];
    var trList = node.querySelectorAll ? node.querySelectorAll('tr') : [];
    for (var r = 0; r < trList.length; r++) {
      var cells = [];
      var cellEls = trList[r].children;
      var isHead = false;
      for (var c = 0; c < cellEls.length; c++) {
        var cell = cellEls[c];
        if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
        if (cell.tagName === 'TH') isHead = true;
        cells.push(renderInline(cell).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim());
      }
      if (cells.length) rows.push({ cells: cells, head: isHead });
    }
    if (!rows.length) return '';
    var width = 0;
    rows.forEach(function (rw) { width = Math.max(width, rw.cells.length); });
    function pad(rw) {
      var cs = rw.cells.slice();
      while (cs.length < width) cs.push('');
      return '| ' + cs.join(' | ') + ' |';
    }
    var out = [];
    var headIdx = 0;
    // use first row as header (whether th or not)
    out.push(pad(rows[0]));
    var sep = [];
    for (var w = 0; w < width; w++) sep.push('---');
    out.push('| ' + sep.join(' | ') + ' |');
    for (var i = 1; i < rows.length; i++) out.push(pad(rows[i]));
    return out.join('\n');
  }

  function htmlToMarkdown(input) {
    var root = getRoot(input);
    if (!root) return '';
    var parts = renderChildren(root, '');
    var md = parts.join('\n\n');
    // tidy: collapse 3+ blank lines, trim trailing ws per line
    md = md.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }

  globalThis.htmlToMarkdown = htmlToMarkdown;
})();
