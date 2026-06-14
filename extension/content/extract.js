/* content/extract.js — in-page main-content → Markdown extractor.
   Injected on demand via chrome.scripting.executeScript({files:[...]}) by the
   side panel and the background context menu. The trailing IIFE call makes the
   injection result be { title, url, markdown }. Fully self-contained. */
(function () {
function extractPageMarkdown() {
  // --- compact in-page html→md (self-contained) ---
  function h2m(rootNode) {
    var NOISE = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, NAV: 1, ASIDE: 1, IFRAME: 1, SVG: 1, FORM: 1, TEMPLATE: 1, HEADER: 1, FOOTER: 1 };
    function ws(s) { return s.replace(/[ \t\r\n\f]+/g, ' '); }
    function escTxt(s) { return s.replace(/([\\`*_\[\]])/g, '\\$1'); }
    function isBlock(node) {
      if (!node || node.nodeType !== 1) return false;
      return /^(P|DIV|SECTION|ARTICLE|MAIN|UL|OL|LI|TABLE|BLOCKQUOTE|PRE|HR|H1|H2|H3|H4|H5|H6|FIGURE|FIGCAPTION)$/.test(node.tagName);
    }
    function renderInline(node) {
      var out = '';
      for (var i = 0; i < node.childNodes.length; i++) out += inlineNode(node.childNodes[i]);
      return out;
    }
    function inlineNode(node) {
      if (node.nodeType === 3) return escTxt(ws(node.nodeValue));
      if (node.nodeType !== 1) return '';
      var tag = node.tagName;
      if (NOISE[tag]) return '';
      if (tag === 'BR') return '  \n';
      if (tag === 'STRONG' || tag === 'B') { var sb = renderInline(node).trim(); return sb ? '**' + sb + '**' : ''; }
      if (tag === 'EM' || tag === 'I') { var se = renderInline(node).trim(); return se ? '*' + se + '*' : ''; }
      if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') { var sd = renderInline(node).trim(); return sd ? '~~' + sd + '~~' : ''; }
      if (tag === 'CODE') {
        var ct = node.textContent;
        var run = (ct.match(/`+/g) || []).reduce(function (m, x) { return Math.max(m, x.length); }, 0);
        var fence = new Array(run + 2).join('`');
        var pad = (/^`|`$/.test(ct) || run) ? ' ' : '';
        return fence + pad + ct + pad + fence;
      }
      if (tag === 'A') {
        var href = node.getAttribute('href') || '';
        var at = renderInline(node).trim();
        if (!href || /^javascript:/i.test(href)) return at;
        if (!at) at = href;
        return '[' + at + '](' + href + ')';
      }
      if (tag === 'IMG') {
        var src = node.getAttribute('src') || node.getAttribute('data-src') || '';
        var alt = node.getAttribute('alt') || '';
        if (!src) return '';
        return '![' + alt.replace(/\]/g, '') + '](' + src + ')';
      }
      return renderInline(node);
    }
    function renderChildren(node, indent) {
      var parts = [], buf = '';
      function flush() { var r = buf.trim(); if (r) parts.push(r); buf = ''; }
      for (var i = 0; i < node.childNodes.length; i++) {
        var k = node.childNodes[i];
        if (k.nodeType === 1 && NOISE[k.tagName]) continue;
        if (isBlock(k)) { flush(); var b = renderBlock(k, indent); if (b) parts.push(b); }
        else buf += inlineNode(k);
      }
      flush();
      return parts;
    }
    function renderBlock(node, indent) {
      indent = indent || '';
      if (node.nodeType === 3) return escTxt(ws(node.nodeValue)).trim();
      if (node.nodeType !== 1) return '';
      var tag = node.tagName;
      if (NOISE[tag]) return '';
      if (/^H[1-6]$/.test(tag)) { var lvl = +tag[1]; var ht = renderInline(node).trim(); return ht ? new Array(lvl + 1).join('#') + ' ' + ht : ''; }
      if (tag === 'HR') return '---';
      if (tag === 'PRE') {
        var codeEl = node.querySelector ? node.querySelector('code') : null;
        var lang = '';
        if (codeEl) {
          var cls = (codeEl.getAttribute('class') || '') + ' ' + (node.getAttribute('class') || '');
          var lm = /(?:^|\s)(?:language-|lang-)([A-Za-z0-9#+._-]+)/.exec(cls);
          if (lm) lang = lm[1];
        }
        var code = (codeEl ? codeEl.textContent : node.textContent) || '';
        code = code.replace(/\n+$/, '');
        var f = '```';
        while (new RegExp('(^|\\n)' + f + '(?!`)').test(code)) f += '`';
        return f + lang + '\n' + code + '\n' + f;
      }
      if (tag === 'BLOCKQUOTE') {
        var inner = renderChildren(node, '').join('\n\n');
        if (!inner) return '';
        return inner.split('\n').map(function (l) { return l ? '> ' + l : '>'; }).join('\n');
      }
      if (tag === 'UL' || tag === 'OL') return renderList(node, indent);
      if (tag === 'TABLE') return renderTable(node);
      return renderChildren(node, indent).join('\n\n');
    }
    function firstMeaningful(li, target) {
      for (var i = 0; i < li.childNodes.length; i++) {
        var k = li.childNodes[i];
        if (k.nodeType === 3 && !k.nodeValue.trim()) continue;
        return k === target;
      }
      return false;
    }
    function renderList(node, indent) {
      var ordered = node.tagName === 'OL';
      var start = parseInt(node.getAttribute('start') || '1', 10);
      var n = isNaN(start) ? 1 : start;
      var lines = [];
      for (var i = 0; i < node.childNodes.length; i++) {
        var li = node.childNodes[i];
        if (li.nodeType !== 1 || li.tagName !== 'LI') continue;
        var marker = ordered ? (n++ + '. ') : '- ';
        var childIndent = indent + new Array(marker.length + 1).join(' ');
        var task = '';
        var cb = li.querySelector ? li.querySelector('input[type=checkbox]') : null;
        if (cb && firstMeaningful(li, cb)) task = (cb.checked || cb.hasAttribute('checked')) ? '[x] ' : '[ ] ';
        var body = renderChildren(li, childIndent).join('\n\n');
        if (task) body = task + body.replace(/^\s+/, '');
        if (!body) { lines.push(indent + marker.replace(/\s+$/, '')); continue; }
        var bl = body.split('\n'), first = true;
        for (var b = 0; b < bl.length; b++) {
          if (bl[b] === '') { lines.push(''); continue; }
          if (first) { lines.push(indent + marker + bl[b]); first = false; }
          else lines.push(childIndent + bl[b]);
        }
      }
      return lines.join('\n');
    }
    function renderTable(node) {
      var rows = [];
      var trs = node.querySelectorAll ? node.querySelectorAll('tr') : [];
      for (var r = 0; r < trs.length; r++) {
        var cells = [], cellEls = trs[r].children;
        for (var c = 0; c < cellEls.length; c++) {
          var cell = cellEls[c];
          if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
          cells.push(renderInline(cell).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim());
        }
        if (cells.length) rows.push(cells);
      }
      if (!rows.length) return '';
      var width = 0; rows.forEach(function (rw) { width = Math.max(width, rw.length); });
      function pad(rw) { var cs = rw.slice(); while (cs.length < width) cs.push(''); return '| ' + cs.join(' | ') + ' |'; }
      var out = [pad(rows[0])], sep = [];
      for (var w = 0; w < width; w++) sep.push('---');
      out.push('| ' + sep.join(' | ') + ' |');
      for (var i = 1; i < rows.length; i++) out.push(pad(rows[i]));
      return out.join('\n');
    }
    var parts = renderChildren(rootNode, '');
    return parts.join('\n\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  // --- main content extraction ---
  function pickMain() {
    var cand = document.querySelector('article') || document.querySelector('main');
    if (cand) return cand;
    // largest text block among common containers
    var nodes = document.querySelectorAll('article, main, section, div');
    var best = null, bestLen = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var len = (el.innerText || el.textContent || '').length;
      if (len > bestLen) { bestLen = len; best = el; }
    }
    return best || document.body;
  }

  var src = pickMain();
  var clone = src.cloneNode(true);
  var junk = clone.querySelectorAll('script, style, noscript, nav, aside, header, footer, form, iframe, svg, template');
  for (var i = 0; i < junk.length; i++) { if (junk[i].parentNode) junk[i].parentNode.removeChild(junk[i]); }

  return {
    title: document.title || '',
    url: location.href,
    markdown: h2m(clone),
  };
}
  return extractPageMarkdown();
})();
