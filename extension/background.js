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
    try {
      let tab = sender && sender.tab;
      if (!tab || tab.id == null) {
        const r1 = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tab = r1[0];
        if (!tab) { const r2 = await chrome.tabs.query({ active: true, currentWindow: true }); tab = r2[0]; }
      }
      if (!tab || tab.id == null) { sendResponse({ ok: false, error: '找不到当前标签页' }); return; }
      const url = tab.url || '';
      if (!/^https?:\/\//i.test(url)) {
        sendResponse({ ok: false, error: '此页面无法剪藏（仅支持普通网页 http/https，不支持 chrome:// / 应用商店 / 本地文件等）' });
        return;
      }
      const res = await clipTab(tab.id);
      sendResponse({ ok: true, name: res && res.name });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // keep the message channel open for the async response
});

// Track open side panels by window via a port the panel holds while open.
// Lets the keyboard command TOGGLE the panel (Chrome has no sidePanel.close()).
const panelPorts = new Map(); // windowId -> port
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'zedown-sidepanel') return;
  let wid = null;
  port.onMessage.addListener((m) => {
    if (m && m.type === 'hello') { wid = m.windowId; panelPorts.set(wid, port); }
  });
  port.onDisconnect.addListener(() => {
    if (wid != null && panelPorts.get(wid) === port) panelPorts.delete(wid);
  });
});

// Keyboard commands (a command is a valid user gesture for sidePanel.open).
//  - open-panel:  toggle the side panel for the active window.
//  - open-editor: open the full editor in a new tab.
chrome.commands.onCommand.addListener(async (command, tab) => {
  let windowId = tab && tab.windowId;
  if (windowId == null) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    windowId = active && active.windowId;
  }
  if (command === 'open-panel') {
    const port = windowId != null ? panelPorts.get(windowId) : null;
    if (port) {
      try { port.postMessage({ type: 'close-panel' }); } catch (e) { /* stale port */ }
    } else {
      try { if (windowId != null) await chrome.sidePanel.open({ windowId }); } catch (e) {}
    }
  } else if (command === 'open-editor') {
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
    files: ['content/extract.js'],
  });
  const data = out && out.result;
  if (!data || !data.markdown) throw new Error('未提取到正文');
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
