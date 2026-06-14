/* background.js — MV3 service worker.
   - Clicking the toolbar icon opens the side panel.
   - Seeds default storage on install.
   - Context menu: capture selection → scratch; clip whole page → 网页剪藏 folder.
   - Keyboard command opens the full editor.

   Note: service workers have no DOM and no DOMParser. All HTML→Markdown
   conversion therefore happens INSIDE the page via chrome.scripting.executeScript
   with a SELF-CONTAINED function (cannot reference outer scope). The injected
   function returns { title, url, markdown } and the SW only appends it to the
   stored tree. We deliberately do NOT importScripts('lib/html2md.js') — that lib
   relies on DOMParser which is absent in the SW. */

const K = { tree: 'md:tree', theme: 'md:theme', active: 'md:active', scratch: 'md:scratch' };

const MENU_SELECTION = 'md-capture-selection';
const MENU_CLIP_PAGE = 'md-clip-page';

// Let a left-click on the action icon open the side panel.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (e) { /* older Chrome: side panel opens via manifest default_path */ }

  // Seed only the lightweight keys here; surfaces fill in the full sample tree
  // via MDStore.init() (which has access to lib/sample.js).
  const cur = await chrome.storage.local.get([K.theme]);
  const patch = {};
  if (cur[K.theme] == null) patch[K.theme] = 'paper';
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);

  // Context menus (recreate to avoid duplicate-id errors across reloads).
  try { await chrome.contextMenus.removeAll(); } catch (e) {}
  chrome.contextMenus.create({
    id: MENU_SELECTION,
    title: '保存选中文本到 Markdown 速记',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: MENU_CLIP_PAGE,
    title: '剪藏整页 (Markdown)',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_SELECTION) {
    await captureSelection(info, tab);
  } else if (info.menuItemId === MENU_CLIP_PAGE) {
    if (tab && tab.id != null) await clipTab(tab.id);
  }
});

// Side panel asks the SW to clip the active tab.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  // ---- whole-page clip (V2) ----
  if (msg.type !== 'clip-page') return;
  (async () => {
    let tabId = sender && sender.tab && sender.tab.id;
    if (tabId == null) {
      const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = active && active.id;
    }
    if (tabId == null) { sendResponse({ ok: false, error: 'no-tab' }); return; }
    try {
      const res = await clipTab(tabId);
      sendResponse({ ok: true, name: res && res.name });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true; // keep the message channel open for the async response
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-editor') {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') });
  }
});

// ---- selection capture (upgraded: capture HTML when possible) ----
async function captureSelection(info, tab) {
  let markdown = '';
  if (tab && tab.id != null) {
    try {
      const [out] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractSelectionMarkdown,
      });
      if (out && out.result) markdown = out.result;
    } catch (e) { /* fall back to plain text below */ }
  }
  if (!markdown) markdown = (info.selectionText || '').trim();
  if (!markdown) return;

  const cur = await chrome.storage.local.get([K.scratch]);
  const prev = cur[K.scratch] || '';
  const stamp = '> 摘自 ' + (tab && tab.title ? tab.title : '网页') + '\n\n';
  const next = (prev ? prev.replace(/\s*$/, '') + '\n\n' : '') + stamp + markdown + '\n';
  await chrome.storage.local.set({ [K.scratch]: next });
  try { if (tab) await chrome.sidePanel.open({ tabId: tab.id }); } catch (e) {}
}

// ---- whole-page clip ----
async function clipTab(tabId) {
  const [out] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageMarkdown,
  });
  const data = out && out.result;
  if (!data || !data.markdown) throw new Error('clip-empty');
  return await appendClip(data);
}

async function appendClip(data) {
  const title = (data.title || '未命名').trim() || '未命名';
  const url = data.url || '';
  const markdown = data.markdown || '';
  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { domain = '网页'; }

  const ts = Date.now();
  const cur = await chrome.storage.local.get([K.tree]);
  let tree = Array.isArray(cur[K.tree]) ? cur[K.tree] : [];

  // Ensure the 网页剪藏 folder exists at root.
  let folder = tree.find((n) => n && n.id === 'clip-web' && n.type === 'folder');
  if (!folder) {
    folder = { id: 'clip-web', type: 'folder', name: '网页剪藏', open: true, children: [] };
    tree = tree.concat([folder]);
  }
  if (!Array.isArray(folder.children)) folder.children = [];

  const name = (title.slice(0, 40) || '剪藏') + '.md';
  const file = {
    id: 'clip' + ts,
    type: 'file',
    name,
    tag: domain,
    updated: '刚刚',
    body: '# ' + title + '\n\n> 来源: ' + url + '\n\n' + markdown,
  };
  folder.children = folder.children.concat([file]);

  await chrome.storage.local.set({ [K.tree]: tree });
  return file;
}

/* =========================================================================
   In-page injected functions. These run in the page context and MUST be
   fully self-contained — they cannot reference any variable above. They
   include a compact HTML→Markdown converter inline.
   ========================================================================= */

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

function extractSelectionMarkdown() {
  // Self-contained: convert the current selection's HTML to markdown in-page.
  function ws(s) { return s.replace(/[ \t\r\n\f]+/g, ' '); }
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
  var container = document.createElement('div');
  for (var r = 0; r < sel.rangeCount; r++) {
    container.appendChild(sel.getRangeAt(r).cloneContents());
  }
  // Reuse a minimal inline-only conversion (selection is usually inline-ish);
  // fall back to plain text if nothing structured.
  var NOISE = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 };
  function escTxt(s) { return s.replace(/([\\`*_\[\]])/g, '\\$1'); }
  function inlineNode(node) {
    if (node.nodeType === 3) return escTxt(ws(node.nodeValue));
    if (node.nodeType !== 1) return '';
    var tag = node.tagName;
    if (NOISE[tag]) return '';
    if (tag === 'BR') return '\n';
    if (tag === 'STRONG' || tag === 'B') { var sb = inner(node).trim(); return sb ? '**' + sb + '**' : ''; }
    if (tag === 'EM' || tag === 'I') { var se = inner(node).trim(); return se ? '*' + se + '*' : ''; }
    if (tag === 'CODE') {
      // Fence with one more backtick than the longest run inside, so code
      // containing backticks stays balanced (e.g. selecting `a`b`).
      var ct = node.textContent;
      var run = 0; var m = ct.match(/`+/g); if (m) m.forEach(function (r) { if (r.length > run) run = r.length; });
      var f = new Array(run + 2).join('`');
      var pad = (/^`|`$/.test(ct)) ? ' ' : '';
      return f + pad + ct + pad + f;
    }
    if (tag === 'A') {
      var href = node.getAttribute('href') || '';
      var at = inner(node).trim();
      if (!href) return at;
      return '[' + (at || href) + '](' + href + ')';
    }
    if (/^H[1-6]$/.test(tag)) { var lvl = +tag[1]; var ht = inner(node).trim(); return '\n' + new Array(lvl + 1).join('#') + ' ' + ht + '\n'; }
    if (tag === 'P' || tag === 'DIV') { var p = inner(node).trim(); return p ? p + '\n\n' : ''; }
    if (tag === 'LI') { return '- ' + inner(node).trim() + '\n'; }
    return inner(node);
  }
  function inner(node) {
    var out = '';
    for (var i = 0; i < node.childNodes.length; i++) out += inlineNode(node.childNodes[i]);
    return out;
  }
  var md = inner(container).replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  return md || (sel.toString().trim());
}
