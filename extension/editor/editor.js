/* editor.js — full-window Markdown editor surface (vanilla JS port of MDFullEditor).
   File rail (tree + create/import/rename/delete + search + theme dots), main column
   (title/meta, edit/split/read segmented, export, open-reader), live split preview,
   inline reader handoff, autosave indicator, footer status bar.
   Consumes window.MDStore, MD_TOKENS, MD_THEMES, MD_SAMPLE, mdToHtml, MDReaderView. */
(function () {
  'use strict';

  const T = window.MD_TOKENS;
  const {
    findNode, patchNode, removeNode, addToFolder, firstFile, flatFiles,
  } = window.MDStore;

  // V3: keyboard-shortcut registry controller (single instance).
  const sc = window.MDShortcuts.create();

  // ── tiny DOM helper ──────────────────────────────────────────────
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'style' && typeof v === 'object') {
          Object.assign(el.style, v);
        } else if (k === 'class') {
          el.className = v;
        } else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'dataset' && typeof v === 'object') {
          Object.assign(el.dataset, v);
        } else {
          el.setAttribute(k, v);
        }
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function px(n) { return n + 'px'; }

  // ── app state ────────────────────────────────────────────────────
  const S = {
    themeId: 'paper',
    tree: [],
    trash: [],
    active: null,
    mode: 'split',
    query: '',
    saved: true,
    menuOpen: false,
    exportOpen: false,  // export dropdown
    trashOpen: false,   // recycle-bin panel
    renaming: null,   // id being renamed
    draft: '',        // rename draft text
    railOpen: true,   // V3: file rail expanded (256px) vs collapsed strip (46px)
    scOpen: false,    // V3: shortcuts panel open
    fsDenied: {},     // FS: per-node-id transient "needs (re)permission" flags
    fsWrite: null,    // FS: live write-back status {state:'writing'|'ok'|'fail', name, fh}
  };

  // FS: feature-detect real local file access (page-only File System Access API).
  function fsOn() { return !!(window.MDFs && window.MDFs.available()); }
  // FS: unique id helper for imported live nodes (avoids same-ms collisions).
  let _fsSeq = 0;
  function fsUid(prefix) { _fsSeq++; return prefix + Date.now().toString(36) + _fsSeq + Math.random().toString(36).slice(2, 5); }
  // FS: collect every fh handle id under a node (walk file + folder subtrees).
  function collectFhs(node, out) {
    out = out || [];
    if (!node) return out;
    if (node.type === 'folder') {
      (node.children || []).forEach(function (c) { collectFhs(c, out); });
    } else if (node.fs && node.fh) {
      out.push(node.fh);
    }
    return out;
  }
  // FS: drop stored handles for a removed subtree (does NOT delete disk files).
  function dropHandles(node) {
    if (!window.MDFs) return;
    collectFhs(node).forEach(function (fh) { try { window.MDFs.del(fh); } catch (e) { /* noop */ } });
  }

  // V3: rail collapse state persists in localStorage.
  try { S.railOpen = localStorage.getItem('mdkit:rail') !== '0'; } catch (e) { /* noop */ }
  function setRail(open) {
    S.railOpen = open;
    try { localStorage.setItem('mdkit:rail', open ? '1' : '0'); } catch (e) { /* noop */ }
    render();
  }

  let savedTimer = null;     // autosave indicator timer
  let treeTimer = null;      // debounced setTree
  let suppressOnChange = false; // ignore our own writes echoed back
  const root = document.getElementById('app');

  // ── persistence ──────────────────────────────────────────────────
  function persistTree() {
    if (treeTimer) clearTimeout(treeTimer);
    const snapshot = S.tree;
    treeTimer = setTimeout(function () {
      suppressOnChange = true;
      window.MDStore.setTree(snapshot).then(function () {
        setTimeout(function () { suppressOnChange = false; }, 50);
      });
    }, 400);
  }
  function persistActive(id) {
    suppressOnChange = true;
    window.MDStore.setActive(id).then(function () {
      setTimeout(function () { suppressOnChange = false; }, 50);
    });
  }
  function persistTrash() {
    suppressOnChange = true;
    window.MDStore.setTrash(S.trash).then(function () {
      setTimeout(function () { suppressOnChange = false; }, 50);
    });
  }

  // ── derived ──────────────────────────────────────────────────────
  function curNode() { return findNode(S.tree, S.active) || {}; }
  function curText() { return curNode().body || ''; }

  function setText(v) {
    S.tree = patchNode(S.tree, S.active, { body: v, updated: '刚刚' });
    markUnsaved();
    persistTree();
    scheduleFsWrite(v);
    updateLiveBits();
  }

  // ── live write-back to the original on-disk file ──────────────────
  // Debounced (~600ms), best-effort, never throws, never blocks typing.
  // chrome.storage autosave (body cache) still runs in parallel via setText.
  let fsWriteTimer = null;
  function scheduleFsWrite(text) {
    const node = curNode();
    if (!node.fs || !node.fh || !window.MDFs) return;
    const fh = node.fh;
    const name = node.name;
    if (fsWriteTimer) clearTimeout(fsWriteTimer);
    fsWriteTimer = setTimeout(function () { doFsWrite(fh, name, text); }, 600);
  }
  function setFsStatus(state, name, fh) {
    S.fsWrite = state ? { state: state, name: name, fh: fh } : null;
    updateFooterFs();
  }
  function doFsWrite(fh, name, text) {
    if (!window.MDFs) return;
    setFsStatus('writing', name, fh);
    window.MDFs.write(fh, text).then(function (r) {
      if (r && r.ok) {
        setFsStatus('ok', name, fh);
        // clear any prior denial flag for the matching active node
        if (curNode().fh === fh) delete S.fsDenied[S.active];
        setTimeout(function () {
          if (S.fsWrite && S.fsWrite.state === 'ok' && S.fsWrite.fh === fh) setFsStatus(null);
        }, 1600);
      } else {
        setFsStatus('fail', name, fh);
      }
    }).catch(function () { setFsStatus('fail', name, fh); });
  }
  // Retry a failed write inside a user gesture (re-grant then re-write).
  function retryFsWrite() {
    const node = curNode();
    const fh = (S.fsWrite && S.fsWrite.fh) || node.fh;
    const name = (S.fsWrite && S.fsWrite.name) || node.name;
    if (!fh || !window.MDFs) return;
    setFsStatus('writing', name, fh);
    window.MDFs.grant(fh, true).then(function () {
      return window.MDFs.write(fh, curText());
    }).then(function (r) {
      if (r && r.ok) {
        delete S.fsDenied[S.active];
        setFsStatus('ok', name, fh);
        setTimeout(function () {
          if (S.fsWrite && S.fsWrite.state === 'ok' && S.fsWrite.fh === fh) setFsStatus(null);
        }, 1600);
      } else {
        setFsStatus('fail', name, fh);
      }
    }).catch(function () { setFsStatus('fail', name, fh); });
  }

  function markUnsaved() {
    S.saved = false;
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { S.saved = true; updateLiveBits(); }, 1000);
  }

  // ── file ops ─────────────────────────────────────────────────────
  function startRename(id, name) { S.renaming = id; S.draft = name; render(); }
  function commitRename() {
    if (S.renaming) {
      S.tree = patchNode(S.tree, S.renaming, { name: (S.draft.trim() || '未命名') });
      persistTree();
    }
    S.renaming = null;
    render();
  }
  function cancelRename() { S.renaming = null; render(); }

  function newNote(folderId) {
    const id = 'n' + Date.now();
    const file = { id: id, type: 'file', name: '未命名.md', tag: '草稿', updated: '刚刚', body: '# 未命名\n\n' };
    S.tree = addToFolder(S.tree, folderId || null, file);
    S.active = id; S.mode = 'split'; markUnsaved(); S.menuOpen = false;
    persistTree(); persistActive(id);
    S.renaming = id; S.draft = '未命名.md';
    render();
  }
  function newFolder() {
    const id = 'd' + Date.now();
    S.tree = S.tree.concat([{ id: id, type: 'folder', name: '新建文件夹', open: true, children: [] }]);
    S.menuOpen = false;
    persistTree();
    S.renaming = id; S.draft = '新建文件夹';
    render();
  }
  function del(id) {
    const res = window.MDStore.moveToTrash(S.tree, S.trash, id, Date.now());
    S.tree = res.tree;
    S.trash = res.trash;
    // Deleting the active note OR any folder/subtree containing it leaves
    // S.active dangling — re-point to the first remaining file.
    if (!findNode(S.tree, S.active)) {
      const f = firstFile(S.tree);
      S.active = f;
      persistActive(f);
    }
    persistTree();
    persistTrash();
    render();
  }
  function restoreTrash(id) {
    const res = window.MDStore.restoreFromTrash(S.tree, S.trash, id);
    S.tree = res.tree;
    S.trash = res.trash;
    persistTree();
    persistTrash();
    render();
  }
  function emptyTrash() {
    // FS: drop stored handles for every live node in the trash (disk files untouched).
    S.trash.forEach(function (n) { dropHandles(n); });
    S.trash = [];
    window.MDStore.setTrash([]);
    suppressOnChange = true;
    setTimeout(function () { suppressOnChange = false; }, 50);
    render();
  }
  function toggleFolder(id) {
    const n = findNode(S.tree, id);
    S.tree = patchNode(S.tree, id, { open: !(n && n.open) });
    persistTree();
    render();
  }
  // Selecting a file. For live (fs) nodes this is a user gesture, so we
  // proactively acquire readwrite permission and refresh content from disk.
  // async, but existing callers ignore the return value.
  async function selectFile(id) {
    S.active = id;
    persistActive(id);
    render();
    const node = findNode(S.tree, id);
    if (!node || !node.fs || !node.fh || !window.MDFs) return;
    await refreshFsNode(node);
  }
  // Re-grant + re-read a live node from disk, updating the cached body
  // WITHOUT bumping 'updated'. Best-effort; never throws.
  async function refreshFsNode(node) {
    try {
      await window.MDFs.grant(node.fh, true);
      const r = await window.MDFs.read(node.fh);
      if (r && r.ok) {
        delete S.fsDenied[node.id];
        S.tree = patchNode(S.tree, node.id, { body: r.text || '' });
        persistTree();
        // re-render so the textarea/preview pick up the fresh on-disk body
        // (skip if the user is mid-typing in this same node to avoid clobbering)
        if (!(S.active === node.id && _taEl && document.activeElement === _taEl)) {
          render();
        }
      } else {
        S.fsDenied[node.id] = true;
        render();
      }
    } catch (e) {
      S.fsDenied[node.id] = true;
      render();
    }
  }
  function setMode(m) { S.mode = m; render(); }

  function importFiles(ev) {
    const list = Array.prototype.slice.call(ev.target.files || []);
    let pending = list.length;
    if (!pending) return;
    let lastId = null;
    list.forEach(function (f) {
      const r = new FileReader();
      r.onload = function () {
        const id = 'i' + Date.now() + Math.random().toString(36).slice(2, 5);
        lastId = id;
        const file = { id: id, type: 'file', name: f.name, tag: '导入', updated: '刚刚', body: String(r.result || '') };
        S.tree = S.tree.concat([file]);
        pending--;
        if (pending === 0 && lastId) {
          S.active = lastId; S.mode = 'split'; markUnsaved();
          persistTree(); persistActive(lastId);
          render();
        }
      };
      r.readAsText(f);
    });
    ev.target.value = '';
    S.menuOpen = false;
  }

  // ── live (real on-disk) file/folder open ─────────────────────────
  // Runs inside the originating click gesture; the picker grants this
  // session's readwrite permission, so no extra prompt is needed here.
  async function openFilesLive() {
    S.menuOpen = false;
    if (!fsOn()) { render(); return; }
    let files;
    try { files = await window.MDFs.openFiles(); } catch (e) { files = []; }
    if (!files || !files.length) { render(); return; }
    let lastId = null;
    files.forEach(function (f) {
      const id = fsUid('fs');
      lastId = id;
      const node = { id: id, type: 'file', name: f.name, tag: '本地', updated: '刚刚', body: f.text || '', fs: true, fh: f.handleId };
      S.tree = addToFolder(S.tree, null, node);
    });
    if (lastId) {
      S.active = lastId; S.mode = 'split'; markUnsaved();
      persistTree(); persistActive(lastId);
    }
    render();
  }

  // Recursively map an MDFs directory tree into editor tree nodes.
  function fsDirToNodes(children) {
    const out = [];
    (children || []).forEach(function (c) {
      if (c.kind === 'dir') {
        out.push({ id: fsUid('fd'), type: 'folder', name: c.name, open: true, children: fsDirToNodes(c.children) });
      } else {
        out.push({ id: fsUid('fs'), type: 'file', name: c.name, tag: '本地', updated: '刚刚', body: c.text || '', fs: true, fh: c.handleId });
      }
    });
    return out;
  }
  async function openDirectoryLive() {
    S.menuOpen = false;
    if (!fsOn()) { render(); return; }
    let dir;
    try { dir = await window.MDFs.openDirectory(); } catch (e) { dir = null; }
    if (!dir) { render(); return; }
    const folder = { id: fsUid('fd'), type: 'folder', name: dir.name || '本地文件夹', open: true, children: fsDirToNodes(dir.children) };
    S.tree = addToFolder(S.tree, null, folder);
    const first = firstFile([folder]);
    if (first) { S.active = first; S.mode = 'split'; markUnsaved(); persistActive(first); }
    persistTree();
    render();
  }

  function mdName(name) {
    let n = name || '未命名.md';
    if (!/\.(md|markdown|txt)$/i.test(n)) n += '.md';
    return n;
  }
  function exportMd() {
    const node = curNode();
    const blob = window.MDExport.noteToBlobMd(node.body || '');
    window.MDExport.download(blob, mdName(node.name));
    S.exportOpen = false; render();
  }
  function exportHtml() {
    const node = curNode();
    const html = window.MDExport.noteToHtml(node.name || '未命名', node.body || '', S.themeId);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    let name = (node.name || '未命名').replace(/\.(md|markdown|txt)$/i, '') + '.html';
    window.MDExport.download(blob, name);
    S.exportOpen = false; render();
  }
  function exportPdf() {
    const node = curNode();
    const html = window.MDExport.noteToHtml(node.name || '未命名', node.body || '', S.themeId);
    window.MDExport.printHtml(html);
    S.exportOpen = false; render();
  }
  // Walk tree -> [{name:'folder/path.md', data}] preserving folder structure.
  function collectZipFiles() {
    const files = [];
    const used = {};
    function uniq(path) {
      if (!used[path]) { used[path] = true; return path; }
      const m = path.match(/^(.*?)(\.[^.\/]+)?$/);
      const base = m[1], ext = m[2] || '';
      let k = 2;
      let cand = base + '-' + k + ext;
      while (used[cand]) { k++; cand = base + '-' + k + ext; }
      used[cand] = true;
      return cand;
    }
    function walk(nodes, prefix) {
      nodes.forEach(function (n) {
        if (n.type === 'folder') {
          walk(n.children || [], prefix + (n.name || '文件夹') + '/');
        } else {
          const path = uniq(prefix + mdName(n.name));
          files.push({ name: path, data: n.body || '' });
        }
      });
    }
    walk(S.tree, '');
    return files;
  }
  function exportZip() {
    const files = collectZipFiles();
    const blob = files.length ? window.makeZip(files) : window.makeZip([{ name: '空.md', data: '' }]);
    window.MDExport.download(blob, 'markdown-notes.zip');
    S.exportOpen = false; render();
  }

  function setTheme(id) {
    S.themeId = id;
    suppressOnChange = true;
    window.MDStore.setTheme(id).then(function () {
      setTimeout(function () { suppressOnChange = false; }, 50);
    });
    render();
  }

  // ── textarea wrap (Cmd/Ctrl+B / +I) ──────────────────────────────
  function wrap(el, pre, post) {
    if (!el) return;
    const text = curText();
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = text.slice(s, e) || '文字';
    const next = text.slice(0, s) + pre + sel + (post || '') + text.slice(e);
    setText(next);
    // sync the textarea value live (avoid full re-render which would lose focus)
    el.value = next;
    requestAnimationFrame(function () {
      el.focus();
      el.selectionStart = s + pre.length;
      el.selectionEnd = s + pre.length + sel.length;
    });
    syncPreview(next);
  }

  function iconBtn(t) {
    return {
      width: '20px', height: '20px', display: 'grid', placeItems: 'center', cursor: 'pointer',
      border: 'none', borderRadius: '5px', background: 'transparent', color: t.muted, fontSize: '11px',
    };
  }

  // ── V3 shortcut actions ──────────────────────────────────────────
  // Prefix the current line (headings / lists / quote), keeping focus & caret.
  function prefixLine(el, prefix) {
    if (!el) return;
    const text = el.value;
    const s = el.selectionStart;
    const ls = text.lastIndexOf('\n', s - 1) + 1;
    const next = text.slice(0, ls) + prefix + text.slice(ls);
    applyTa(el, next, s + prefix.length);
    el.focus();
  }
  // Insert [sel](https://) selecting the url placeholder.
  function insertLinkV3(el) {
    if (!el) return;
    const text = el.value;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = text.slice(s, e) || '链接文字';
    const ins = '[' + sel + '](https://)';
    const next = text.slice(0, s) + ins + text.slice(e);
    const p = s + 1 + sel.length + 2;
    applyTa(el, next, p, p + 8);
    el.focus();
  }
  // Run a shortcut action by registry id. Returns true if handled.
  function runAction(id) {
    const el = _taEl;
    switch (id) {
      case 'bold': wrap(el, '**', '**'); return true;
      case 'italic': wrap(el, '*', '*'); return true;
      case 'code': wrap(el, '`', '`'); return true;
      case 'link': insertLinkV3(el); return true;
      case 'heading': prefixLine(el, '## '); return true;
      case 'list': prefixLine(el, '- '); return true;
      case 'task': prefixLine(el, '- [ ] '); return true;
      case 'quote': prefixLine(el, '> '); return true;
      case 'studio': openStudio(); return true;
      case 'save': S.saved = true; updateLiveBits(); return true;
      case 'toggleSplit': setMode(S.mode === 'edit' ? 'split' : 'edit'); return true;
      case 'reading': setMode('read'); return true;
      case 'shortcuts': openShortcuts(); return true;
      default: return false;
    }
  }
  function comboFor(id) { return window.MD_fmtCombo(sc.comboFor(id)); }

  // ── V3 shortcuts panel (mounted into editor root) ────────────────
  let _scPanelEl = null;
  function openShortcuts() {
    if (_scPanelEl) return;
    const t = T[S.themeId];
    const panel = window.MDShortcutsPanel(t, sc, closeShortcuts);
    _scPanelEl = panel;
    root.appendChild(panel);
  }
  function closeShortcuts() {
    if (_scPanelEl) {
      if (typeof _scPanelEl._destroy === 'function') _scPanelEl._destroy();
      if (_scPanelEl.parentNode) _scPanelEl.parentNode.removeChild(_scPanelEl);
      _scPanelEl = null;
    }
  }

  // ── V2 Visual Diagram Studio (mounted into editor root) ──────────
  let _studioEl = null;
  let _zdBar = null;
  function liveTextarea() { return (_taEl && document.contains(_taEl)) ? _taEl : null; }

  // Open the studio. With no args it inserts at the caret; with (kind, graph,
  // range) it re-opens an existing ```zdiagram block and replaces it on insert.
  function openStudio(initialKind, initialGraph, replaceRange, initialForm) {
    if (_studioEl || typeof window.VisualStudio !== 'function') return;
    const modal = window.VisualStudio({
      t: T[S.themeId],
      themeId: S.themeId,
      initialKind: initialKind || 'flowchart',
      initialGraph: initialGraph || null,
      initialForm: initialForm || null,
      onClose: closeStudio,
      onInsert: function (snippet) { insertSnippet(snippet, replaceRange); },
    });
    _studioEl = modal;
    root.appendChild(modal);
  }
  function closeStudio() {
    if (!_studioEl) return;
    if (typeof _studioEl._destroy === 'function') _studioEl._destroy();
    if (_studioEl.parentNode) _studioEl.parentNode.removeChild(_studioEl);
    _studioEl = null;
    const ta = liveTextarea();
    if (ta) requestAnimationFrame(function () { ta.focus(); });
  }

  // Insert (or replace) a fenced diagram block at the caret. Canvas kinds come
  // pre-fenced (```zdiagram); form kinds arrive as bare mermaid → wrap it. Block
  // is padded with blank lines so it parses as its own paragraph.
  function insertSnippet(snippet, replaceRange) {
    const block = snippet.indexOf('```') === 0 ? snippet : ('```mermaid\n' + snippet + '\n```');
    const ta = liveTextarea();
    const text = ta ? ta.value : curText();
    let s, e;
    if (replaceRange) { s = replaceRange.start; e = replaceRange.end; }
    else if (ta) { s = ta.selectionStart; e = ta.selectionEnd; }
    else { s = text.length; e = text.length; }
    const before = text.slice(0, s);
    const after = text.slice(e);
    const padBefore = !before ? '' : (/\n\n$/.test(before) ? '' : (/\n$/.test(before) ? '\n' : '\n\n'));
    const padAfter = !after ? '\n' : (/^\n\n/.test(after) ? '' : (/^\n/.test(after) ? '\n' : '\n\n'));
    const ins = padBefore + block + padAfter;
    const next = before + ins + after;
    const caret = before.length + padBefore.length + block.length;
    if (ta) { applyTa(ta, next, caret); requestAnimationFrame(function () { ta.focus(); }); }
    else { setText(next); render(); }
    removeZdBar();
  }

  // Find the ```zdiagram block (if any) whose char range contains `pos`.
  function findZdiagramBlockAt(text, pos) {
    const re = /```zdiagram[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
    let m;
    while ((m = re.exec(text))) {
      const start = m.index, end = re.lastIndex;
      if (pos >= start && pos <= end) {
        let graph = null;
        try { graph = JSON.parse(m[1]); } catch (err) { /* keep raw */ }
        return { start: start, end: end, graph: graph };
      }
    }
    return null;
  }
  function removeZdBar() { if (_zdBar) { if (_zdBar.parentNode) _zdBar.parentNode.removeChild(_zdBar); _zdBar = null; } }
  const KIND_LABEL = { flowchart: '流程图', state: '状态图', mindmap: '思维导图', class: '类图', sequence: '时序图', pie: '饼图', gantt: '甘特图' };
  function detectMermaidKind(code) {
    const head = (String(code || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '').toLowerCase();
    if (head.indexOf('sequencediagram') === 0) return 'sequence';
    if (head.indexOf('pie') === 0) return 'pie';
    if (head.indexOf('gantt') === 0) return 'gantt';
    if (head.indexOf('statediagram') === 0) return 'state';
    if (head.indexOf('classdiagram') === 0) return 'class';
    if (head.indexOf('mindmap') === 0) return 'mindmap';
    if (head.indexOf('flowchart') === 0 || head.indexOf('graph ') === 0) return 'flowchart';
    return '';
  }
  // The diagram block (```zdiagram or ```mermaid) whose char range holds the caret.
  function diagramBlockAt(text, pos) {
    const zd = findZdiagramBlockAt(text, pos);
    if (zd) return { type: 'zdiagram', start: zd.start, end: zd.end, graph: zd.graph };
    const re = /```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```/g; let m;
    while ((m = re.exec(text))) { if (pos >= m.index && pos <= re.lastIndex) return { type: 'mermaid', start: m.index, end: re.lastIndex, code: m[1] }; }
    return null;
  }
  // Show/refresh the floating "edit this diagram" bar when the caret sits inside
  // ANY diagram block — ```zdiagram OR ```mermaid (sequence / pie / gantt). Edit/
  // split only. ✎编辑 re-opens the studio (canvas → graph; form → parsed mermaid);
  // unparseable hand-written mermaid shows just the label + 🗑删除.
  function updateZdBar() {
    if (_studioEl) { removeZdBar(); return; }
    const ta = liveTextarea();
    if (!ta || (S.mode !== 'edit' && S.mode !== 'split')) { removeZdBar(); return; }
    const blk = diagramBlockAt(ta.value, ta.selectionStart);
    if (!blk) { removeZdBar(); return; }
    let kindLabel = '图表', onEdit = null;
    if (blk.type === 'zdiagram') {
      const k = blk.graph && blk.graph.kind;
      kindLabel = KIND_LABEL[k] || '图表';
      if (blk.graph) onEdit = function () { openStudio(k || 'flowchart', blk.graph, { start: blk.start, end: blk.end }); };
    } else {
      const form = (typeof window.VS_parseMermaid === 'function') ? window.VS_parseMermaid(blk.code) : null;
      if (form && form.kind) { kindLabel = KIND_LABEL[form.kind] || '图表'; onEdit = function () { openStudio(form.kind, null, { start: blk.start, end: blk.end }, form); }; }
      else { kindLabel = KIND_LABEL[detectMermaidKind(blk.code)] || '图表'; }
    }
    const t = T[S.themeId];
    removeZdBar();
    const pill = function (primary) { return { border: primary ? 'none' : '1px solid ' + t.border, background: primary ? t.accent : t.surface, color: primary ? t.accentText : t.muted, cursor: 'pointer', borderRadius: '999px', padding: '5px 12px', fontSize: '12px', fontWeight: '600', fontFamily: t.fontUI }; };
    const bar = h('div', {
      style: {
        position: 'fixed', top: '94px', left: '50%', transform: 'translateX(-50%)', zIndex: '40',
        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px 6px 13px',
        background: t.surface, border: '1px solid ' + t.border, borderRadius: '999px',
        boxShadow: '0 6px 20px rgba(0,0,0,.16)', fontFamily: t.fontUI, fontSize: '12px', color: t.muted,
      },
    },
      h('span', null, '当前' + kindLabel),
      onEdit ? h('button', { onmousedown: function (e) { e.preventDefault(); }, onclick: onEdit, style: pill(true) }, '✎ 编辑') : false,
      h('button', { onmousedown: function (e) { e.preventDefault(); }, onclick: function () { deleteZdBlock(blk); }, style: pill(false) }, '🗑 删除')
    );
    _zdBar = bar;
    root.appendChild(bar);
  }
  function deleteZdBlock(blk) {
    const ta = liveTextarea(); if (!ta) return;
    const text = ta.value;
    let e = blk.end;
    if (text[e] === '\n') e++; // swallow one trailing newline
    const next = text.slice(0, blk.start) + text.slice(e);
    applyTa(ta, next, blk.start);
    removeZdBar();
    ta.focus();
  }
  // All ```zdiagram blocks in document order, with char ranges + parsed graph.
  function allZdiagramBlocks(text) {
    const re = /```zdiagram[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
    const out = []; let m;
    while ((m = re.exec(text))) {
      let g = null; try { g = JSON.parse(m[1]); } catch (err) { /* keep raw */ }
      out.push({ start: m.index, end: re.lastIndex, graph: g });
    }
    return out;
  }
  // Map a rendered .md-zdiagram figure (in the live preview) back to its source
  // block by document order, then act on it. The Nth rendered figure ↔ Nth
  // ```zdiagram block — md.js emits both in document order.
  function zdBlockForFig(fig) {
    const ta = liveTextarea();
    if (!ta || !_previewEl) return null;
    const figs = Array.prototype.slice.call(_previewEl.querySelectorAll('.md-zdiagram'));
    const idx = figs.indexOf(fig);
    if (idx < 0) return null;
    const blocks = allZdiagramBlocks(ta.value);
    return blocks[idx] || null;
  }
  // All ```mermaid blocks in document order, with char ranges + raw code.
  function allMermaidBlocks(text) {
    const re = /```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
    const out = []; let m;
    while ((m = re.exec(text))) out.push({ start: m.index, end: re.lastIndex, code: m[1] });
    return out;
  }
  function mermaidBlockForFig(fig) {
    const ta = liveTextarea();
    if (!ta || !_previewEl) return null;
    const figs = Array.prototype.slice.call(_previewEl.querySelectorAll('.md-mermaid'));
    const idx = figs.indexOf(fig);
    if (idx < 0) return null;
    const blocks = allMermaidBlocks(ta.value);
    return blocks[idx] || null;
  }
  // Hover affordance on every rendered diagram in the editor preview: a
  // ✎编辑 / 🗑删除 overlay appears on hover (double-click the figure also edits).
  // Canvas (```zdiagram) re-opens the studio with the stored graph; form
  // (```mermaid) re-opens it by parsing the mermaid back into form state, and
  // falls back to selecting the source block when it can't be parsed.
  function attachDiagramHover(container) {
    if (!container || !container.querySelectorAll) return;
    attachHoverFor(container.querySelectorAll('.md-zdiagram'), editZdFig, deleteZdFig, true);
    attachHoverFor(container.querySelectorAll('.md-mermaid'), editMermaidFig, deleteMermaidFig, true);
  }
  function attachHoverFor(figs, onEdit, onDelete, hugContent) {
    const t = T[S.themeId];
    const miniBtn = function (primary) {
      return { border: primary ? 'none' : '1px solid ' + t.border, background: primary ? t.accent : t.surface, color: primary ? t.accentText : t.muted, cursor: 'pointer', borderRadius: '7px', padding: '5px 10px', fontSize: '12px', fontWeight: '600', fontFamily: t.fontUI };
    };
    for (let i = 0; i < figs.length; i++) {
      const fig = figs[i];
      if (fig.dataset.diagHover === '1') continue;
      fig.dataset.diagHover = '1';
      // Wrap the figure so the overlay is a SIBLING of the diagram, not a child:
      // mermaid renders async and overwrites the block's innerHTML, which would
      // wipe an overlay placed inside it.
      const wrap = h('div', { style: { position: 'relative', display: hugContent ? 'inline-block' : 'block', maxWidth: '100%' } });
      if (fig.parentNode) { fig.parentNode.insertBefore(wrap, fig); wrap.appendChild(fig); }
      const bar = h('div', {
        style: {
          position: 'absolute', top: '8px', right: '8px', zIndex: '5', display: 'none',
          alignItems: 'center', gap: '6px', padding: '4px', background: t.surface,
          border: '1px solid ' + t.border, borderRadius: '9px', boxShadow: '0 6px 18px rgba(0,0,0,.16)',
        },
      },
        h('button', { onclick: function (ev) { ev.stopPropagation(); onEdit(fig); }, title: '编辑此图', style: miniBtn(true) }, '✎ 编辑'),
        h('button', { onclick: function (ev) { ev.stopPropagation(); onDelete(fig); }, title: '删除此图', style: miniBtn(false) }, '🗑 删除')
      );
      wrap.appendChild(bar);
      wrap.addEventListener('mouseenter', function () { bar.style.display = 'flex'; });
      wrap.addEventListener('mouseleave', function () { bar.style.display = 'none'; });
      fig.addEventListener('dblclick', function (ev) { ev.preventDefault(); onEdit(fig); });
    }
  }
  function editZdFig(fig) {
    const blk = zdBlockForFig(fig);
    if (!blk) return;
    openStudio((blk.graph && blk.graph.kind) || 'flowchart', blk.graph, { start: blk.start, end: blk.end });
  }
  function deleteZdFig(fig) {
    const ta = liveTextarea(); if (!ta) return;
    const blk = zdBlockForFig(fig); if (!blk) return;
    let e = blk.end;
    if (ta.value[e] === '\n') e++;
    applyTa(ta, ta.value.slice(0, blk.start) + ta.value.slice(e), blk.start);
  }
  function editMermaidFig(fig) {
    const ta = liveTextarea(); if (!ta) return;
    const blk = mermaidBlockForFig(fig); if (!blk) return;
    const form = (typeof window.VS_parseMermaid === 'function') ? window.VS_parseMermaid(blk.code) : null;
    if (form && form.kind) openStudio(form.kind, null, { start: blk.start, end: blk.end }, form);
    else { ta.focus(); ta.selectionStart = blk.start; ta.selectionEnd = blk.end; } // hand-written: jump to source
  }
  function deleteMermaidFig(fig) {
    const ta = liveTextarea(); if (!ta) return;
    const blk = mermaidBlockForFig(fig); if (!blk) return;
    let e = blk.end;
    if (ta.value[e] === '\n') e++;
    applyTa(ta, ta.value.slice(0, blk.start) + ta.value.slice(e), blk.start);
  }

  // ── live-update bits that change without a full re-render ─────────
  // (footer status + autosave dot + preview), keeping textarea focused.
  let _previewEl = null;
  let _footerEls = null;
  function updateLiveBits() {
    const text = curText();
    if (_footerEls) {
      _footerEls.dot.style.background = S.saved ? T[S.themeId].accent : T[S.themeId].faint;
      _footerEls.status.textContent = S.saved ? '已同步' : '保存中…';
      const chars = text.length;
      const words = (text.trim().match(/[一-龥]|\w+/g) || []).length;
      _footerEls.words.textContent = words + ' 词';
      _footerEls.chars.textContent = chars + ' 字符';
    }
  }
  // FS: refresh the footer write-back status pill in place (no full re-render).
  function updateFooterFs() {
    if (!_footerEls || !_footerEls.fs) return;
    const el = _footerEls.fs;
    const t = T[S.themeId];
    el.textContent = '';
    el.onclick = null;
    el.style.cursor = 'default';
    el.style.color = t.faint;
    const w = S.fsWrite;
    if (!w) { el.style.display = 'none'; return; }
    el.style.display = 'inline-flex';
    if (w.state === 'writing') {
      el.textContent = '写回中…';
    } else if (w.state === 'ok') {
      el.style.color = t.muted;
      el.textContent = '已写回 ' + (w.name || '');
    } else { // fail
      el.style.color = t.accent || t.text;
      el.style.cursor = 'pointer';
      el.textContent = '写回失败 · 点此授权';
      el.onclick = function () { retryFsWrite(); };
    }
  }
  function enhanceProse(el) {
    if (!el || !window.MDEnhance) return;
    try {
      window.MDEnhance.codeCopyButtons(el);
      window.MDEnhance.headingAnchors(el);
      window.MDEnhance.renderMermaid(el, S.themeId);
      if (window.MDEnhance.renderZdiagram) window.MDEnhance.renderZdiagram(el, S.themeId);
      // Hover edit/delete overlay on every rendered diagram (editor preview only).
      if (el === _previewEl && (S.mode === 'edit' || S.mode === 'split')) attachDiagramHover(el);
    } catch (e) { /* noop */ }
  }
  function syncPreview(text) {
    if (_previewEl) {
      _previewEl.innerHTML = window.mdToHtml(text);
      enhanceProse(_previewEl);
    }
  }

  // ── rename input ─────────────────────────────────────────────────
  function renameInput(t) {
    const inp = h('input', {
      value: S.draft,
      onclick: function (e) { e.stopPropagation(); },
      oninput: function (e) { S.draft = e.target.value; },
      onblur: commitRename,
      onkeydown: function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
        if (e.key === 'Escape') { cancelRename(); }
      },
      style: {
        flex: '1', minWidth: '0', border: '1px solid ' + t.accent, borderRadius: '5px', outline: 'none',
        background: t.surface, color: t.text, fontSize: '13px', padding: '2px 6px', fontFamily: t.fontUI,
      },
    });
    requestAnimationFrame(function () { inp.focus(); inp.select(); });
    return inp;
  }

  function rowEl(t, opts, children) {
    opts = opts || {};
    const depth = opts.depth || 0;
    const on = !!opts.on;
    const row = h('div', {
      class: 'md-row',
      onclick: opts.onClick,
      style: {
        display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', position: 'relative',
        padding: '7px 9px', paddingLeft: px(9 + depth * 14), borderRadius: px(t.radius), marginBottom: '1px',
        background: on ? t.surface : 'transparent', boxShadow: on ? t.shadow : 'none',
        border: '1px solid ' + (on ? t.border : 'transparent'),
      },
    }, children);
    if (opts.dragId) attachDrag(row, opts.dragId, opts.isFolder, t);
    return row;
  }

  // ── pointer-based drag-to-reorder ─────────────────────────────────
  function attachDrag(row, id, isFolder, t) {
    row.dataset.nodeId = id;
    row.addEventListener('pointerdown', function (e) {
      // ignore clicks on buttons / inputs inside the row
      if (e.target.closest('button') || e.target.closest('input')) return;
      if (e.button !== 0) return;
      const startX = e.clientX, startY = e.clientY;
      let dragging = false;
      let ghost = null;

      function onMove(ev) {
        if (!dragging) {
          if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5) return;
          dragging = true;
          row.setPointerCapture(ev.pointerId);
          ghost = row.cloneNode(true);
          ghost.style.position = 'fixed';
          ghost.style.left = px(row.getBoundingClientRect().left);
          ghost.style.width = px(row.offsetWidth);
          ghost.style.pointerEvents = 'none';
          ghost.style.opacity = '0.85';
          ghost.style.zIndex = '70';
          ghost.style.background = t.surface;
          ghost.style.boxShadow = '0 6px 18px rgba(0,0,0,.25)';
          document.body.appendChild(ghost);
          row.style.opacity = '0.4';
        }
        if (ghost) ghost.style.top = px(ev.clientY - 12);
        clearDropMarks();
        const tgt = dropTargetAt(ev.clientX, ev.clientY);
        if (tgt) markDrop(tgt.row, tgt.pos);
      }
      function onUp(ev) {
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onUp, true);
        if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
        row.style.opacity = '';
        clearDropMarks();
        try { row.releasePointerCapture(ev.pointerId); } catch (_) {}
        if (!dragging) return;
        const tgt = dropTargetAt(ev.clientX, ev.clientY);
        if (tgt && tgt.id !== id) {
          const next = window.MDStore.reorderTree(S.tree, id, tgt.id, tgt.pos);
          if (next !== S.tree) { S.tree = next; persistTree(); render(); }
        }
      }
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
    });
  }
  function clearDropMarks() {
    const rows = document.querySelectorAll('.md-row');
    for (let i = 0; i < rows.length; i++) {
      rows[i].style.borderTopColor = '';
      rows[i].style.borderBottomColor = '';
      rows[i].style.outline = '';
    }
  }
  function markDrop(row, pos) {
    const t = T[S.themeId];
    if (pos === 'inside') { row.style.outline = '2px solid ' + t.accent; }
    else if (pos === 'before') { row.style.borderTopColor = t.accent; }
    else { row.style.borderBottomColor = t.accent; }
  }
  function dropTargetAt(x, y) {
    const rows = document.querySelectorAll('.md-row[data-node-id]');
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
        const tid = rows[i].dataset.nodeId;
        const node = findNode(S.tree, tid);
        const rel = (y - r.top) / r.height;
        let pos;
        if (node && node.type === 'folder') {
          if (rel < 0.25) pos = 'before';
          else if (rel > 0.75) pos = 'after';
          else pos = 'inside';
        } else {
          pos = rel < 0.5 ? 'before' : 'after';
        }
        return { row: rows[i], id: tid, pos: pos };
      }
    }
    return null;
  }

  function renderNodes(t, nodes, depth) {
    const out = [];
    nodes.forEach(function (n) {
      if (n.type === 'folder') {
        const count = (n.children || []).filter(function (c) { return c.type === 'file'; }).length;
        const actions = h('span', {
          class: 'md-actions',
          style: { display: 'none', gap: '2px' },
        },
          h('button', {
            title: '在此新建', style: iconBtn(t),
            onclick: function (e) { e.stopPropagation(); newNote(n.id); },
          }, '＋'),
          h('button', {
            title: '重命名', style: iconBtn(t),
            onclick: function (e) { e.stopPropagation(); startRename(n.id, n.name); },
          }, '✎'),
          h('button', {
            title: '删除文件夹（含内容，移入回收站）', style: iconBtn(t),
            onclick: function (e) { e.stopPropagation(); del(n.id); },
          }, '✕')
        );
        const label = (S.renaming === n.id)
          ? renameInput(t)
          : h('span', {
              style: {
                flex: '1', fontSize: '13px', fontWeight: '600', color: t.text,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              },
            }, n.name);
        const row = rowEl(t, { depth: depth, dragId: n.id, isFolder: true, onClick: function () { toggleFolder(n.id); } }, [
          h('span', { style: { width: '12px', color: t.faint, fontSize: '10px', transition: 'transform .15s', transform: n.open ? 'rotate(90deg)' : 'none', display: 'inline-block' } }, '▶'),
          h('span', { style: { fontSize: '13.5px' } }, n.open ? '📂' : '📁'),
          label,
          h('span', { style: { fontSize: '11px', color: t.faint, fontFamily: t.fontMono } }, String(count)),
          actions,
        ]);
        const wrapper = h('div', null, row);
        if (n.open) wrapper.appendChild(h('div', null, renderNodes(t, n.children || [], depth + 1)));
        out.push(wrapper);
      } else {
        const on = n.id === S.active;
        const actions = h('span', {
          class: 'md-actions',
          style: { display: 'none', gap: '2px' },
        },
          h('button', {
            title: '重命名', style: iconBtn(t),
            onclick: function (e) { e.stopPropagation(); startRename(n.id, n.name); },
          }, '✎'),
          h('button', {
            title: '删除', style: iconBtn(t),
            onclick: function (e) { e.stopPropagation(); del(n.id); },
          }, '✕')
        );
        // FS: marker glyph + denied affordance for live (on-disk) nodes.
        const isFs = !!(n.fs && n.fh);
        const nameRow = h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '4px', minWidth: '0' },
        },
          isFs ? h('span', {
            title: '本地文件 · 编辑自动写回',
            style: { flexShrink: '0', fontSize: '11px', color: t.faint },
          }, '⎙') : false,
          h('span', {
            style: {
              flex: '1', minWidth: '0', fontSize: '13px', fontWeight: on ? '600' : '500', color: on ? t.text : t.muted,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            },
          }, n.name)
        );
        const meta = h('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', marginTop: '2px', fontSize: '10.5px', color: t.faint } },
          h('span', { style: { fontFamily: t.fontMono } }, n.tag || ''),
          h('span', null, '·'),
          h('span', null, n.updated || ''),
          (isFs && S.fsDenied[n.id]) ? h('span', {
            title: '点击重新授权并从磁盘刷新',
            onclick: function (e) { e.stopPropagation(); var node = findNode(S.tree, n.id); if (node) refreshFsNode(node); },
            style: { cursor: 'pointer', color: t.accent || t.text, fontWeight: '600' },
          }, '⚠ 需授权') : false
        );
        const body = (S.renaming === n.id)
          ? renameInput(t)
          : h('div', { style: { flex: '1', minWidth: '0' } }, nameRow, meta);
        out.push(rowEl(t, { depth: depth, on: on, dragId: n.id, isFolder: false, onClick: function () { selectFile(n.id); } }, [
          h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: on ? t.accent : t.faint, flexShrink: '0', marginLeft: '3px' } }),
          body,
          actions,
        ]));
      }
    });
    return out;
  }

  // ── textarea utilities (smart editing / slash / find-replace) ────
  let _taEl = null;          // active textarea reference
  let _slashEl = null;       // open slash menu element
  let _slashIdx = 0;         // highlighted slash item
  let _slashStart = -1;      // caret position of the "/" that opened the menu

  // Apply a new value to the textarea + state, keeping focus & a caret range.
  function applyTa(el, next, selStart, selEnd) {
    setText(next);
    el.value = next;
    if (selStart != null) {
      el.selectionStart = selStart;
      el.selectionEnd = (selEnd == null ? selStart : selEnd);
    }
    syncPreview(next);
  }

  function lineBounds(text, pos) {
    let start = text.lastIndexOf('\n', pos - 1) + 1;
    let end = text.indexOf('\n', pos);
    if (end === -1) end = text.length;
    return { start: start, end: end };
  }

  // Enter: continue list/todo markers; outdent (clear) empty items.
  function handleEnter(el, e) {
    const text = el.value;
    const s = el.selectionStart, e2 = el.selectionEnd;
    if (s !== e2) return false;
    const lb = lineBounds(text, s);
    const line = text.slice(lb.start, lb.end);
    const m = line.match(/^(\s*)(-\s\[[ xX]\]\s|[-*+]\s|\d+\.\s)(.*)$/);
    if (!m) return false;
    const indent = m[1], marker = m[2], content = m[3];
    if (content.trim() === '') {
      // empty item -> outdent / clear marker
      const next = text.slice(0, lb.start) + indent + text.slice(lb.end);
      e.preventDefault();
      applyTa(el, next, lb.start + indent.length);
      return true;
    }
    let nextMarker = marker;
    const ord = marker.match(/^(\d+)\.\s$/);
    if (ord) nextMarker = (parseInt(ord[1], 10) + 1) + '. ';
    else if (/^\s*-\s\[[ xX]\]\s$/.test(indent + marker)) nextMarker = '- [ ] ';
    else if (/^-\s\[[ xX]\]\s$/.test(marker)) nextMarker = '- [ ] ';
    const insert = '\n' + indent + nextMarker;
    const next = text.slice(0, s) + insert + text.slice(e2);
    e.preventDefault();
    applyTa(el, next, s + insert.length);
    return true;
  }

  // Tab / Shift+Tab: indent / outdent selected lines.
  function handleTab(el, e, outdent) {
    const text = el.value;
    let s = el.selectionStart, end = el.selectionEnd;
    const startLB = lineBounds(text, s);
    const region = text.slice(startLB.start, end);
    const lines = text.slice(startLB.start, lineBounds(text, end).end).split('\n');
    e.preventDefault();
    const before = text.slice(0, startLB.start);
    const tail = text.slice(lineBounds(text, end).end);
    let delta = 0, firstDelta = 0;
    const out = lines.map(function (ln, i) {
      if (outdent) {
        const m = ln.match(/^(\t| {1,2})/);
        if (m) { delta -= m[1].length; if (i === 0) firstDelta = -m[1].length; return ln.slice(m[1].length); }
        return ln;
      }
      delta += 2; if (i === 0) firstDelta = 2;
      return '  ' + ln;
    });
    const next = before + out.join('\n') + tail;
    applyTa(el, next, Math.max(startLB.start, s + firstDelta), end + delta);
    return true;
  }

  // Auto-pair * ` [
  function handlePair(el, e) {
    const pairs = { '*': '*', '`': '`', '[': ']' };
    if (!pairs[e.key]) return false;
    const text = el.value;
    const s = el.selectionStart, end = el.selectionEnd;
    if (s === end) return false; // only wrap when there is a selection
    e.preventDefault();
    const sel = text.slice(s, end);
    const next = text.slice(0, s) + e.key + sel + pairs[e.key] + text.slice(end);
    applyTa(el, next, s + 1, end + 1);
    return true;
  }

  // Cmd/Ctrl+K -> wrap selection as [sel](url)
  function handleLink(el) {
    const text = el.value;
    const s = el.selectionStart, end = el.selectionEnd;
    const sel = text.slice(s, end) || '链接文字';
    const insert = '[' + sel + '](url)';
    const next = text.slice(0, s) + insert + text.slice(end);
    const urlStart = s + 1 + sel.length + 2;
    applyTa(el, next, urlStart, urlStart + 3);
    el.focus();
  }

  // ── slash command menu ───────────────────────────────────────────
  const SLASH_ITEMS = [
    ['标题 1', '# '],
    ['标题 2', '## '],
    ['标题 3', '### '],
    ['无序列表', '- '],
    ['有序列表', '1. '],
    ['待办', '- [ ] '],
    ['代码块', '```\n\n```'],
    ['表格', '| 列 1 | 列 2 |\n| --- | --- |\n|  |  |'],
    ['引用', '> '],
    ['分隔线', '\n---\n'],
  ];
  function closeSlash() {
    if (_slashEl && _slashEl.parentNode) _slashEl.parentNode.removeChild(_slashEl);
    _slashEl = null; _slashStart = -1; _slashIdx = 0;
  }
  function openSlash(el) {
    closeSlash();
    _slashStart = el.selectionStart - 1; // position of the "/"
    _slashIdx = 0;
    const t = T[S.themeId];
    const menu = h('div', {
      style: {
        position: 'fixed', zIndex: '60', width: '188px', maxHeight: '280px', overflow: 'auto',
        background: t.surface, border: '1px solid ' + t.border, borderRadius: px(t.radius),
        boxShadow: '0 10px 30px rgba(0,0,0,.22)', padding: '5px', fontFamily: t.fontUI,
      },
    });
    SLASH_ITEMS.forEach(function (it, i) {
      const b = h('button', {
        dataset: { idx: String(i) },
        onmousedown: function (e) { e.preventDefault(); chooseSlash(el, i); },
        style: {
          display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
          background: i === _slashIdx ? t.accentSoft : 'transparent', color: t.text,
          fontFamily: t.fontUI, fontSize: '13px', padding: '7px 10px', borderRadius: px(t.radius - 3),
        },
      }, it[0]);
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    _slashEl = menu;
    positionSlash(el);
  }
  function positionSlash(el) {
    if (!_slashEl) return;
    const r = el.getBoundingClientRect();
    let top = r.top + 40, left = r.left + 30;
    if (top + 280 > window.innerHeight) top = Math.max(8, window.innerHeight - 288);
    _slashEl.style.top = px(top);
    _slashEl.style.left = px(left);
  }
  function highlightSlash() {
    if (!_slashEl) return;
    const t = T[S.themeId];
    const btns = _slashEl.querySelectorAll('button');
    for (let i = 0; i < btns.length; i++) {
      btns[i].style.background = (i === _slashIdx) ? t.accentSoft : 'transparent';
    }
  }
  function chooseSlash(el, i) {
    const item = SLASH_ITEMS[i];
    if (!item) { closeSlash(); return; }
    const text = el.value;
    const caret = el.selectionStart;
    // remove from "/" to caret (covers "/" + any typed filter chars)
    const from = _slashStart >= 0 ? _slashStart : caret - 1;
    const snippet = item[1];
    const next = text.slice(0, from) + snippet + text.slice(caret);
    // place caret: inside code fence / after marker
    let caretPos = from + snippet.length;
    const codeIdx = snippet.indexOf('```\n');
    if (codeIdx === 0) caretPos = from + 4; // inside the fence
    closeSlash();
    applyTa(el, next, caretPos);
    el.focus();
  }

  // ── find & replace panel ─────────────────────────────────────────
  const F = { open: false, replaceMode: false, find: '', replace: '', lastIndex: -1 };
  let _findPanelEl = null;

  function openFind(replaceMode) {
    F.open = true;
    F.replaceMode = !!replaceMode;
    const el = _taEl;
    if (el) {
      const sel = el.value.slice(el.selectionStart, el.selectionEnd);
      if (sel) F.find = sel;
    }
    renderFindPanel();
    if (_findPanelEl) {
      const inp = _findPanelEl.querySelector('input[data-role="find"]');
      if (inp) requestAnimationFrame(function () { inp.focus(); inp.select(); });
    }
  }
  function closeFind() {
    F.open = false;
    if (_findPanelEl && _findPanelEl.parentNode) _findPanelEl.parentNode.removeChild(_findPanelEl);
    _findPanelEl = null;
    if (_taEl) _taEl.focus();
  }
  function doFind(dir) {
    const el = _taEl;
    if (!el || !F.find) return;
    const text = el.value;
    const needle = F.find;
    let from;
    if (dir >= 0) {
      from = (el.selectionEnd != null) ? el.selectionEnd : 0;
      let idx = text.indexOf(needle, from);
      if (idx === -1) idx = text.indexOf(needle, 0); // wrap
      if (idx === -1) return;
      el.focus(); el.setSelectionRange(idx, idx + needle.length);
      F.lastIndex = idx;
    } else {
      const before = (el.selectionStart != null) ? el.selectionStart - 1 : text.length;
      let idx = text.lastIndexOf(needle, Math.max(0, before - 1));
      if (idx === -1) idx = text.lastIndexOf(needle); // wrap
      if (idx === -1) return;
      el.focus(); el.setSelectionRange(idx, idx + needle.length);
      F.lastIndex = idx;
    }
    scrollSelIntoView(el);
  }
  function scrollSelIntoView(el) {
    // crude: scroll so selection start is roughly visible
    const text = el.value.slice(0, el.selectionStart);
    const line = text.split('\n').length;
    const lineH = 14 * 1.75;
    el.scrollTop = Math.max(0, line * lineH - el.clientHeight / 2);
  }
  function doReplace() {
    const el = _taEl;
    if (!el || !F.find) return;
    const sel = el.value.slice(el.selectionStart, el.selectionEnd);
    if (sel === F.find) {
      const s = el.selectionStart;
      const next = el.value.slice(0, s) + F.replace + el.value.slice(el.selectionEnd);
      applyTa(el, next, s, s + F.replace.length);
      el.setSelectionRange(s + F.replace.length, s + F.replace.length);
    }
    doFind(1);
  }
  function doReplaceAll() {
    const el = _taEl;
    if (!el || !F.find) return;
    const next = el.value.split(F.find).join(F.replace);
    applyTa(el, next, el.selectionStart, el.selectionStart);
  }
  function renderFindPanel() {
    if (_findPanelEl && _findPanelEl.parentNode) _findPanelEl.parentNode.removeChild(_findPanelEl);
    if (!F.open) { _findPanelEl = null; return; }
    const t = T[S.themeId];
    const inputStyle = {
      border: '1px solid ' + t.border, borderRadius: px(t.radius - 3), outline: 'none',
      background: t.surface, color: t.text, fontSize: '12.5px', padding: '5px 8px',
      fontFamily: t.fontUI, width: '170px',
    };
    const btnStyle = {
      border: '1px solid ' + t.border, background: t.surface, color: t.muted, cursor: 'pointer',
      borderRadius: px(t.radius - 3), padding: '4px 9px', fontSize: '12px', fontFamily: t.fontUI,
    };
    const findInput = h('input', {
      'data-role': 'find', value: F.find, placeholder: '查找…',
      oninput: function (e) { F.find = e.target.value; },
      onkeydown: function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doFind(e.shiftKey ? -1 : 1); }
        if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
      },
      style: inputStyle,
    });
    const row1 = h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
      findInput,
      h('button', { onclick: function () { doFind(-1); }, style: btnStyle }, '↑'),
      h('button', { onclick: function () { doFind(1); }, style: btnStyle }, '↓'),
      h('button', { onclick: closeFind, style: btnStyle }, '✕')
    );
    const children = [row1];
    if (F.replaceMode) {
      const repInput = h('input', {
        value: F.replace, placeholder: '替换为…',
        oninput: function (e) { F.replace = e.target.value; },
        onkeydown: function (e) {
          if (e.key === 'Enter') { e.preventDefault(); doReplace(); }
          if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
        },
        style: inputStyle,
      });
      children.push(h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' } },
        repInput,
        h('button', { onclick: doReplace, style: btnStyle }, '替换'),
        h('button', { onclick: doReplaceAll, style: btnStyle }, '全部')
      ));
    }
    const panel = h('div', {
      style: {
        position: 'fixed', top: '64px', right: '24px', zIndex: '55',
        background: t.surface2, border: '1px solid ' + t.border, borderRadius: px(t.radius),
        boxShadow: '0 10px 30px rgba(0,0,0,.18)', padding: '10px',
      },
    }, children);
    document.body.appendChild(panel);
    _findPanelEl = panel;
  }

  // ── editor textarea ──────────────────────────────────────────────
  function buildTextarea(t) {
    const ta = h('textarea', {
      spellcheck: 'false',
      style: {
        width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none',
        background: 'transparent', color: t.text,
        padding: S.mode === 'edit' ? '34px 18%' : '26px 30px',
        fontFamily: t.fontMono, fontSize: '14px', lineHeight: '1.75', boxSizing: 'border-box',
      },
    });
    ta.value = curText();
    _taEl = ta;
    ta.addEventListener('input', function (e) {
      setText(e.target.value);
      syncPreview(e.target.value);
      // typed "/" at line start (or after whitespace) opens the slash menu
      if (e.data === '/') {
        const v = e.target.value;
        const c = e.target.selectionStart;
        const prev = v[c - 2];
        if (prev == null || prev === '\n' || prev === ' ') openSlash(ta);
      } else if (_slashEl) {
        // close if caret moved before the "/" or the "/" was removed
        const v = e.target.value;
        if (_slashStart < 0 || v[_slashStart] !== '/' || e.target.selectionStart <= _slashStart) closeSlash();
      }
    });
    ta.addEventListener('blur', function () { closeSlash(); });
    // V2: refresh the "edit this diagram" bar as the caret moves.
    ta.addEventListener('keyup', updateZdBar);
    ta.addEventListener('click', updateZdBar);
    ta.addEventListener('keydown', function (e) {
      // slash menu navigation takes priority
      if (_slashEl) {
        if (e.key === 'ArrowDown') { e.preventDefault(); _slashIdx = (_slashIdx + 1) % SLASH_ITEMS.length; highlightSlash(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); _slashIdx = (_slashIdx - 1 + SLASH_ITEMS.length) % SLASH_ITEMS.length; highlightSlash(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseSlash(ta, _slashIdx); return; }
        if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return; }
      }
      // V3: registry owns bold/italic/code/link/heading/list/task/quote/save/
      // toggleSplit/reading/shortcuts. Check it FIRST; fall through to the
      // existing find/replace + smart-edit handlers only when no action matches.
      const actionId = sc.matchAction(e);
      if (actionId) { e.preventDefault(); runAction(actionId); return; }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); openFind(false); return; }
      if (mod && (e.key === 'h' || e.key === 'H')) { e.preventDefault(); openFind(true); return; }
      if (e.key === 'Enter' && !mod && !e.shiftKey) { if (handleEnter(ta, e)) return; }
      if (e.key === 'Tab') { handleTab(ta, e, e.shiftKey); return; }
      if (!mod && handlePair(ta, e)) return;
    });
    return ta;
  }

  function buildPreview(t) {
    const div = h('div', {
      class: 'prose',
      style: { position: 'absolute', inset: '0', overflow: 'auto', padding: '26px 34px' },
    });
    div.innerHTML = window.mdToHtml(curText());
    _previewEl = div;
    enhanceProse(div);
    return div;
  }

  // ── view segment button ──────────────────────────────────────────
  function viewSeg(t, active, label, onClick) {
    return h('button', {
      onclick: onClick,
      style: {
        border: 'none', cursor: 'pointer', fontFamily: t.fontUI, fontSize: '12.5px', fontWeight: '600',
        padding: '6px 14px', borderRadius: px(t.radius - 4), color: active ? t.text : t.muted,
        background: active ? t.surface : 'transparent', boxShadow: active ? t.shadow : 'none',
        transition: 'all .15s',
      },
    }, label);
  }

  // ── V3 Yuque-style format bar ────────────────────────────────────
  // A format button with a hover tooltip showing the live shortcut combo.
  function fmtBtn(t, glyph, label, id, opts) {
    opts = opts || {};
    const wrapper = h('div', { style: { position: 'relative' } });
    const btn = h('button', {
      onmousedown: function (e) { e.preventDefault(); },
      onclick: function () { runAction(id); },
      style: {
        width: '30px', height: '30px', display: 'grid', placeItems: 'center', cursor: 'pointer',
        border: 'none', borderRadius: px(t.radius - 3), background: 'transparent',
        color: t.muted, fontSize: opts.mono ? '11px' : '15px', fontWeight: '700',
        fontStyle: opts.italic ? 'italic' : 'normal', fontFamily: opts.mono ? t.fontMono : t.fontUI,
        transition: 'all .12s',
      },
    }, glyph);
    const combo = comboFor(id);
    const tip = h('div', {
      style: {
        position: 'absolute', top: '38px', left: '50%', transform: 'translateX(-50%)', zIndex: '30',
        display: 'none', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap',
        background: '#1c1d20', color: '#fff', padding: '6px 9px', borderRadius: '7px',
        boxShadow: '0 6px 20px rgba(0,0,0,.28)', fontFamily: t.fontUI, fontSize: '12px',
      },
    },
      h('span', {
        style: {
          position: 'absolute', top: '-4px', left: '50%', marginLeft: '-4px', width: '8px', height: '8px',
          background: '#1c1d20', transform: 'rotate(45deg)',
        },
      }),
      label,
      combo ? h('span', {
        style: {
          fontFamily: t.fontMono, fontSize: '11px', fontWeight: '600', color: '#cfd2d8',
          background: 'rgba(255,255,255,.12)', padding: '1px 6px', borderRadius: '5px',
        },
      }, combo) : false
    );
    wrapper.addEventListener('mouseenter', function () { btn.style.background = t.surface2; btn.style.color = t.text; tip.style.display = 'flex'; });
    wrapper.addEventListener('mouseleave', function () { btn.style.background = 'transparent'; btn.style.color = t.muted; tip.style.display = 'none'; });
    wrapper.appendChild(btn);
    wrapper.appendChild(tip);
    return wrapper;
  }
  function buildFormatBar(t) {
    const sep = function () { return h('div', { style: { width: '1px', height: '18px', background: t.border, margin: '0 6px' } }); };
    const allBtn = h('button', {
      onclick: function (e) { e.stopPropagation(); openShortcuts(); },
      style: {
        border: 'none', background: 'transparent', cursor: 'pointer', color: t.faint,
        fontSize: '11.5px', fontFamily: t.fontUI, display: 'flex', alignItems: 'center', gap: '6px',
      },
    },
      h('span', null, '全部快捷键'),
      h('span', {
        style: {
          fontFamily: t.fontMono, fontSize: '11px', fontWeight: '600', color: t.muted,
          background: t.surface2, border: '1px solid ' + t.border, padding: '1px 6px', borderRadius: '5px',
        },
      }, comboFor('shortcuts'))
    );
    return h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '2px', padding: '6px 16px', flexShrink: '0',
        borderBottom: '1px solid ' + t.border, background: t.surface, position: 'relative', zIndex: '6',
      },
    },
      fmtBtn(t, 'B', '加粗', 'bold'),
      fmtBtn(t, 'I', '斜体', 'italic', { italic: true }),
      fmtBtn(t, '</>', '行内代码', 'code', { mono: true }),
      fmtBtn(t, '↗', '插入链接', 'link'),
      sep(),
      fmtBtn(t, 'H', '标题', 'heading'),
      fmtBtn(t, '≡', '无序列表', 'list'),
      fmtBtn(t, '✓', '待办项', 'task'),
      fmtBtn(t, '“', '引用', 'quote'),
      sep(),
      studioBtn(t),
      h('div', { style: { flex: '1' } }),
      allBtn
    );
  }
  // ── visual-diagram-studio launcher (sits in the format bar) ──────
  function studioBtn(t) {
    const btn = h('button', {
      onmousedown: function (e) { e.preventDefault(); },
      onclick: function () { openStudio(); },
      title: '可视化图表 · 拖拽 / 填表画图,无需手写代码',
      style: {
        display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
        border: '1px solid ' + t.border, borderRadius: px(t.radius - 3), background: 'transparent',
        color: t.muted, fontSize: '12px', fontWeight: '600', fontFamily: t.fontUI, padding: '0 10px', height: '30px',
        transition: 'all .12s',
      },
    }, h('span', { style: { fontSize: '14px' } }, '⧉'), '画图');
    btn.addEventListener('mouseenter', function () { btn.style.background = t.surface2; btn.style.color = t.text; btn.style.borderColor = t.borderStrong; });
    btn.addEventListener('mouseleave', function () { btn.style.background = 'transparent'; btn.style.color = t.muted; btn.style.borderColor = t.border; });
    return btn;
  }

  // ── V3 empty state (no files) ────────────────────────────────────
  function buildEmptyState(t) {
    return h('div', { style: { flex: '1', display: 'grid', placeItems: 'center', padding: '24px' } },
      h('div', { style: { textAlign: 'center', maxWidth: '320px' } },
        h('div', {
          style: {
            width: '44px', height: '44px', margin: '0 auto 16px', borderRadius: '12px',
            border: '2px dashed ' + (t.borderStrong || t.border), display: 'grid', placeItems: 'center',
            color: t.faint, fontSize: '22px',
          },
        }, '+'),
        h('div', { style: { fontSize: '15px', fontWeight: '600', marginBottom: '5px' } }, '还没有笔记'),
        h('div', { style: { fontSize: '12.5px', color: t.faint, marginBottom: '18px', lineHeight: '1.6' } }, '新建一篇开始书写，或导入本地 .md 文件。'),
        h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' } },
          h('button', {
            onclick: function () { newNote(null); },
            style: {
              border: 'none', background: t.accent, color: t.accentText, cursor: 'pointer',
              borderRadius: px(t.radius), padding: '8px 16px', fontSize: '12.5px', fontWeight: '700', fontFamily: t.fontUI,
            },
          }, '＋ 新建笔记'),
          h('button', {
            onclick: function () { if (fileInputEl) fileInputEl.click(); },
            style: {
              border: '1px solid ' + t.border, background: t.surface, color: t.muted, cursor: 'pointer',
              borderRadius: px(t.radius), padding: '8px 16px', fontSize: '12.5px', fontWeight: '600', fontFamily: t.fontUI,
            },
          }, '导入 .md'),
          // FS: real local open entries (only when the API is available).
          fsOn() ? h('button', {
            onclick: function () { openFilesLive(); },
            style: {
              border: '1px solid ' + t.border, background: t.surface, color: t.muted, cursor: 'pointer',
              borderRadius: px(t.radius), padding: '8px 16px', fontSize: '12.5px', fontWeight: '600', fontFamily: t.fontUI,
            },
          }, '打开文件…') : false,
          fsOn() ? h('button', {
            onclick: function () { openDirectoryLive(); },
            style: {
              border: '1px solid ' + t.border, background: t.surface, color: t.muted, cursor: 'pointer',
              borderRadius: px(t.radius), padding: '8px 16px', fontSize: '12.5px', fontWeight: '600', fontFamily: t.fontUI,
            },
          }, '打开文件夹…') : false
        )
      )
    );
  }

  // ── export dropdown menu ─────────────────────────────────────────
  function buildExportMenu(t) {
    const btn = h('button', {
      onclick: function (e) { e.stopPropagation(); S.exportOpen = !S.exportOpen; render(); },
      style: {
        border: '1px solid ' + t.border, background: S.exportOpen ? t.accent : t.surface,
        color: S.exportOpen ? t.accentText : t.muted, cursor: 'pointer',
        borderRadius: px(t.radius), padding: '7px 13px', fontSize: '12.5px', fontWeight: '600', fontFamily: t.fontUI,
      },
    }, '导出 ↧');
    const wrapper = h('div', { style: { position: 'relative' } }, btn);
    if (S.exportOpen) {
      const overlay = h('div', {
        onclick: function () { S.exportOpen = false; render(); },
        style: { position: 'fixed', inset: '0', zIndex: '40' },
      });
      const items = [
        ['📝', '导出 .md', exportMd],
        ['🌐', '导出 .html', exportHtml],
        ['🖨', '打印·PDF', exportPdf],
        ['🗜', '导出全部 .zip', exportZip],
      ];
      const menu = h('div', {
        style: {
          position: 'absolute', top: '40px', right: '0', zIndex: '41', width: '176px',
          background: t.surface, border: '1px solid ' + t.border, borderRadius: px(t.radius),
          boxShadow: '0 10px 30px rgba(0,0,0,.18)', overflow: 'hidden', padding: '5px',
        },
      }, items.map(function (it) {
        const b = h('button', {
          onclick: function (e) { e.stopPropagation(); it[2](); },
          style: {
            display: 'flex', alignItems: 'center', gap: '9px', width: '100%', textAlign: 'left',
            border: 'none', background: 'transparent', cursor: 'pointer', color: t.text,
            fontFamily: t.fontUI, fontSize: '13px', padding: '8px 10px', borderRadius: px(t.radius - 3),
          },
        }, h('span', { style: { width: '16px', textAlign: 'center' } }, it[0]), it[1]);
        b.addEventListener('mouseenter', function () { b.style.background = t.surface2; });
        b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; });
        return b;
      }));
      wrapper.appendChild(overlay);
      wrapper.appendChild(menu);
    }
    return wrapper;
  }

  // ── render ───────────────────────────────────────────────────────
  let fileInputEl = null;

  function render() {
    const themeId = S.themeId;
    const t = T[themeId];
    _previewEl = null;
    _footerEls = null;
    _taEl = null;
    closeSlash();
    // V3: close shortcuts panel before clearing root (frees its key listener).
    closeShortcuts();
    // close find panel in read mode (no textarea to act on)
    if (S.mode === 'read' && F.open) closeFind();
    root.textContent = '';
    root.className = 'theme-' + themeId;

    // hover style for row actions
    let hoverStyle = document.getElementById('md-row-hover');
    if (!hoverStyle) {
      hoverStyle = h('style', { id: 'md-row-hover' });
      document.head.appendChild(hoverStyle);
    }
    hoverStyle.textContent = '.md-row:hover .md-actions{display:flex !important;}';

    // ── READ mode: hand off to reusable reader view ──
    if (S.mode === 'read') {
      const wrapDiv = h('div', {
        class: 'theme-' + themeId,
        style: { width: '100%', height: '100%', overflow: 'hidden', background: t.app },
      });
      root.appendChild(wrapDiv);
      const node = curNode();
      if (typeof window.MDReaderView === 'function') {
        window.MDReaderView(wrapDiv, {
          themeId: themeId,
          content: curText(),
          title: node.name || '未命名',
          onEdit: function () { setMode('split'); },
          onTheme: function (id) { setTheme(id); },
        });
      } else {
        // fallback: simple prose render
        const prose = h('div', {
          class: 'prose',
          style: { maxWidth: '720px', margin: '0 auto', padding: '40px 24px', overflow: 'auto', height: '100%', boxSizing: 'border-box' },
        });
        prose.innerHTML = window.mdToHtml(curText());
        enhanceProse(prose);
        const backBtn = h('button', {
          onclick: function () { setMode('split'); },
          style: {
            position: 'fixed', top: '16px', right: '16px', zIndex: '10',
            border: '1px solid ' + t.border, background: t.surface, color: t.muted, cursor: 'pointer',
            borderRadius: px(t.radius), padding: '7px 13px', fontSize: '12.5px', fontWeight: '600', fontFamily: t.fontUI,
          },
        }, '编辑');
        wrapDiv.appendChild(prose);
        wrapDiv.appendChild(backBtn);
      }
      return;
    }

    const container = h('div', {
      style: {
        width: '100%', height: '100%', display: 'flex', overflow: 'hidden',
        background: t.app, fontFamily: t.fontUI, color: t.text,
      },
    });

    // hidden file input for import (also used by collapsed strip + empty state)
    fileInputEl = h('input', {
      type: 'file', accept: '.md,.markdown,.txt,text/markdown,text/plain', multiple: 'multiple',
      onchange: importFiles, style: { display: 'none' },
    });
    container.appendChild(fileInputEl);

    // ── V3 collapsed file rail (46px strip: Z + » expand + ＋ new) ──
    if (!S.railOpen) {
      const strip = h('div', {
        style: {
          width: '46px', flexShrink: '0', display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '10px', padding: '14px 0', background: t.surface2, borderRight: '1px solid ' + t.border,
        },
      },
        h('div', {
          style: {
            width: '26px', height: '26px', borderRadius: '7px', background: t.accent, color: t.accentText,
            display: 'grid', placeItems: 'center', fontFamily: t.fontMono, fontWeight: '800', fontSize: '14px',
          },
        }, 'Z'),
        h('button', {
          title: '展开侧边栏', onclick: function () { setRail(true); },
          style: {
            width: '30px', height: '30px', borderRadius: '8px', border: '1px solid ' + t.border, cursor: 'pointer',
            background: t.surface, color: t.muted, fontSize: '14px', display: 'grid', placeItems: 'center',
          },
        }, '»'),
        h('button', {
          title: '新建笔记', onclick: function () { newNote(null); },
          style: {
            width: '30px', height: '30px', borderRadius: '8px', border: '1px solid ' + t.border, cursor: 'pointer',
            background: t.surface, color: t.muted, fontSize: '18px', lineHeight: '1', display: 'grid', placeItems: 'center',
          },
        }, '+')
      );
      container.appendChild(strip);
    } else {

    // ── file rail ──
    const rail = h('div', {
      style: {
        width: '256px', flexShrink: '0', display: 'flex', flexDirection: 'column',
        background: t.surface2, borderRight: '1px solid ' + t.border,
      },
    });

    // brand header + menu
    const plusBtn = h('button', {
      title: '新建',
      onclick: function (e) { e.stopPropagation(); S.menuOpen = !S.menuOpen; render(); },
      style: {
        width: '28px', height: '28px', borderRadius: '8px', border: '1px solid ' + t.border, cursor: 'pointer',
        background: S.menuOpen ? t.accent : t.surface, color: S.menuOpen ? t.accentText : t.muted,
        fontSize: '18px', lineHeight: '1', display: 'grid', placeItems: 'center',
      },
    }, '+');
    const collapseBtn = h('button', {
      title: '收起侧边栏',
      onclick: function (e) { e.stopPropagation(); setRail(false); },
      style: {
        width: '28px', height: '28px', borderRadius: '8px', border: '1px solid ' + t.border, cursor: 'pointer',
        background: t.surface, color: t.muted, fontSize: '14px', lineHeight: '1', display: 'grid', placeItems: 'center',
      },
    }, '«');

    const header = h('div', {
      style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '15px 14px 12px', position: 'relative' },
    },
      h('div', {
        style: {
          width: '26px', height: '26px', borderRadius: '7px', background: t.accent, color: t.accentText,
          display: 'grid', placeItems: 'center', fontFamily: t.fontMono, fontWeight: '800', fontSize: '14px',
        },
      }, 'Z'),
      h('span', { style: { fontWeight: '700', fontSize: '15px', flex: '1' } }, 'Zedown'),
      collapseBtn,
      plusBtn
    );

    if (S.menuOpen) {
      const overlay = h('div', {
        onclick: function () { S.menuOpen = false; render(); },
        style: { position: 'fixed', inset: '0', zIndex: '40' },
      });
      const menuItems = [
        ['📄', '新建笔记', function () { newNote(null); }],
        ['📁', '新建文件夹', newFolder],
        ['↥', '导入 .md', function () { if (fileInputEl) fileInputEl.click(); S.menuOpen = false; render(); }],
      ];
      // FS: real local open entries (only when the File System Access API is available).
      if (fsOn()) {
        menuItems.push(['⎙', '打开文件…', function () { openFilesLive(); }]);
        menuItems.push(['🗂', '打开文件夹…', function () { openDirectoryLive(); }]);
      }
      const menu = h('div', {
        style: {
          position: 'absolute', top: '46px', right: '14px', zIndex: '41', width: '168px',
          background: t.surface, border: '1px solid ' + t.border, borderRadius: px(t.radius),
          boxShadow: '0 10px 30px rgba(0,0,0,.18)', overflow: 'hidden', padding: '5px',
        },
      }, menuItems.map(function (it) {
        const b = h('button', {
          onclick: it[2],
          style: {
            display: 'flex', alignItems: 'center', gap: '9px', width: '100%', textAlign: 'left',
            border: 'none', background: 'transparent', cursor: 'pointer', color: t.text,
            fontFamily: t.fontUI, fontSize: '13px', padding: '8px 10px', borderRadius: px(t.radius - 3),
          },
        },
          h('span', { style: { width: '16px', textAlign: 'center' } }, it[0]),
          it[1]
        );
        b.addEventListener('mouseenter', function () { b.style.background = t.surface2; });
        b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; });
        return b;
      }));
      header.appendChild(overlay);
      header.appendChild(menu);
    }
    rail.appendChild(header);

    // search box
    const search = h('input', {
      value: S.query, placeholder: '搜索笔记…',
      oninput: function (e) { S.query = e.target.value; renderTree(); },
      style: {
        width: '100%', boxSizing: 'border-box', border: '1px solid ' + t.border, borderRadius: px(t.radius),
        background: t.surface, color: t.text, padding: '7px 11px', fontSize: '12.5px', outline: 'none', fontFamily: t.fontUI,
      },
    });
    rail.appendChild(h('div', { style: { padding: '0 12px 10px' } }, search));

    // tree container (re-renderable in isolation for search keystrokes)
    const treeWrap = h('div', { style: { flex: '1', overflow: 'auto', padding: '0 8px 8px' } });
    rail.appendChild(treeWrap);

    function renderTree() {
      treeWrap.textContent = '';
      const q = S.query.trim();
      if (q) {
        const hits = flatFiles(S.tree).filter(function (f) {
          return f.name.toLowerCase().indexOf(q.toLowerCase()) > -1;
        });
        if (hits.length) {
          hits.forEach(function (f) {
            const on = f.id === S.active;
            treeWrap.appendChild(rowEl(t, { depth: 0, on: on, onClick: function () { selectFile(f.id); } }, [
              h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: on ? t.accent : t.faint, marginLeft: '3px' } }),
              h('span', {
                style: { flex: '1', fontSize: '13px', color: on ? t.text : t.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
              }, f.name),
            ]));
          });
        } else {
          treeWrap.appendChild(h('div', {
            style: { padding: '20px 12px', fontSize: '12.5px', color: t.faint, textAlign: 'center' },
          }, '没有匹配的笔记'));
        }
      } else {
        renderNodes(t, S.tree, 0).forEach(function (n) { treeWrap.appendChild(n); });
      }
    }
    renderTree();

    // theme dots
    const dots = h('div', {
      style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 16px', borderTop: '1px solid ' + t.border },
    }, h('span', { style: { fontSize: '11px', color: t.faint, marginRight: 'auto' } }, '主题'));
    window.MD_THEMES.forEach(function (th) {
      dots.appendChild(h('button', {
        title: th.label,
        onclick: function () { setTheme(th.id); },
        style: {
          width: '18px', height: '18px', borderRadius: '50%', cursor: 'pointer', padding: '0', background: T[th.id].accent,
          border: '2px solid ' + (th.id === themeId ? t.text : 'transparent'), outline: '1px solid ' + t.border,
        },
      }));
    });
    rail.appendChild(dots);

    // recycle bin affordance
    const trashBtn = h('button', {
      onclick: function () { S.trashOpen = !S.trashOpen; render(); },
      style: {
        display: 'flex', alignItems: 'center', gap: '7px', width: '100%', textAlign: 'left',
        border: 'none', borderTop: '1px solid ' + t.border, background: S.trashOpen ? t.surface : 'transparent',
        color: t.muted, cursor: 'pointer', fontFamily: t.fontUI, fontSize: '12.5px', padding: '10px 16px',
      },
    },
      h('span', null, '🗑'),
      h('span', { style: { flex: '1' } }, '回收站'),
      h('span', { style: { fontFamily: t.fontMono, fontSize: '11px', color: t.faint } }, String(S.trash.length))
    );
    rail.appendChild(trashBtn);
    container.appendChild(rail);
    } // end expanded rail

    // ── main column ──
    const main = h('div', {
      style: { flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column', background: t.surface },
    });
    const node = curNode();

    const topBar = h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '14px', padding: '0 20px', height: '56px',
        borderBottom: '1px solid ' + t.border, flexShrink: '0',
      },
    },
      h('div', { style: { minWidth: '0', flex: '1' } },
        h('div', { style: { fontSize: '15px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, node.name || '未命名'),
        h('div', { style: { fontSize: '11px', color: t.faint, marginTop: '1px' } }, (node.tag || '草稿') + ' · 更新于 ' + (node.updated || '刚刚'))
      ),
      h('div', { style: { display: 'flex', gap: '3px', padding: '3px', borderRadius: px(t.radius), background: t.surface2, border: '1px solid ' + t.border } },
        viewSeg(t, S.mode === 'edit', '编辑', function () { setMode('edit'); }),
        viewSeg(t, S.mode === 'split', '分屏', function () { setMode('split'); }),
        viewSeg(t, S.mode === 'read', '阅读', function () { setMode('read'); })
      ),
      h('button', {
        title: '键盘快捷键',
        onclick: function (e) { e.stopPropagation(); openShortcuts(); },
        style: {
          width: '34px', height: '34px', display: 'grid', placeItems: 'center', cursor: 'pointer',
          border: '1px solid ' + t.border, background: t.surface, color: t.muted,
          borderRadius: px(t.radius), fontSize: '15px',
        },
      }, '⌨'),
      buildExportMenu(t)
    );
    main.appendChild(topBar);

    // ── V3 Yuque-style format bar (hidden in empty state — no textarea to act on) ──
    const noFiles = flatFiles(S.tree).length === 0;
    if (!noFiles) main.appendChild(buildFormatBar(t));

    // edit/split area
    const work = h('div', { style: { flex: '1', minHeight: '0', display: 'flex' } });
    if (noFiles) {
      work.appendChild(buildEmptyState(t));
    } else if (S.mode === 'edit') {
      const ta = buildTextarea(t);
      work.appendChild(h('div', { style: { flex: '1', position: 'relative', overflow: 'auto' } }, ta));
      requestAnimationFrame(function () { ta.focus(); });
    } else { // split
      const ta = buildTextarea(t);
      work.appendChild(h('div', { style: { flex: '1', position: 'relative', overflow: 'auto', borderRight: '1px solid ' + t.border } }, ta));
      work.appendChild(h('div', { style: { flex: '1', position: 'relative', background: t.surface } }, buildPreview(t)));
    }
    main.appendChild(work);

    // footer status bar
    const dot = h('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: S.saved ? t.accent : t.faint } });
    const statusText = h('span', null, S.saved ? '已同步' : '保存中…');
    const text = curText();
    const chars = text.length;
    const words = (text.trim().match(/[一-龥]|\w+/g) || []).length;
    const wordsEl = h('span', { style: { fontFamily: t.fontMono } }, words + ' 词');
    const charsEl = h('span', { style: { fontFamily: t.fontMono } }, chars + ' 字符');
    const statusSpan = h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, dot, statusText);
    // FS: live write-back status pill (hidden until a write is in flight / done / failed).
    const fsStatusEl = h('span', { style: { display: 'none', alignItems: 'center', gap: '4px', fontFamily: t.fontUI } });
    _footerEls = { dot: dot, status: statusText, words: wordsEl, chars: charsEl, fs: fsStatusEl };

    const footer = h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '16px', padding: '0 20px', height: '32px', flexShrink: '0',
        borderTop: '1px solid ' + t.border, background: t.surface2, fontSize: '11.5px', color: t.muted,
      },
    },
      statusSpan,
      wordsEl,
      charsEl,
      fsStatusEl,
      h('div', { style: { flex: '1' } }),
      h('span', { style: { fontFamily: t.fontMono, color: t.faint } }, 'Markdown · UTF-8')
    );
    main.appendChild(footer);
    updateFooterFs();

    container.appendChild(main);
    root.appendChild(container);

    // recycle-bin panel overlay
    if (S.trashOpen) root.appendChild(buildTrashPanel(t));

    // re-open find panel after a full re-render (it lives on body)
    if (F.open) renderFindPanel();
  }

  // ── recycle-bin panel ────────────────────────────────────────────
  function buildTrashPanel(t) {
    const overlay = h('div', {
      onclick: function (e) { if (e.target === overlay) { S.trashOpen = false; render(); } },
      style: {
        position: 'fixed', inset: '0', zIndex: '50', background: 'rgba(0,0,0,.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      },
    });
    const items = S.trash.slice().reverse().map(function (n) {
      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
          borderRadius: px(t.radius - 3), marginBottom: '2px', background: t.surface2,
        },
      },
        h('span', null, n.type === 'folder' ? '📁' : '📄'),
        h('span', {
          style: { flex: '1', fontSize: '13px', color: t.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        }, n.name || '未命名'),
        h('button', {
          onclick: function () { restoreTrash(n.id); },
          style: {
            border: '1px solid ' + t.border, background: t.surface, color: t.muted, cursor: 'pointer',
            borderRadius: px(t.radius - 3), padding: '4px 10px', fontSize: '12px', fontFamily: t.fontUI,
          },
        }, '恢复')
      );
    });
    const panel = h('div', {
      style: {
        width: '380px', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        background: t.surface, border: '1px solid ' + t.border, borderRadius: px(t.radius),
        boxShadow: '0 18px 50px rgba(0,0,0,.3)', overflow: 'hidden', fontFamily: t.fontUI,
      },
    },
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 16px',
          borderBottom: '1px solid ' + t.border,
        },
      },
        h('span', { style: { fontWeight: '700', fontSize: '14px', flex: '1', color: t.text } }, '回收站'),
        h('span', { style: { fontSize: '11.5px', color: t.faint, fontFamily: t.fontMono } }, S.trash.length + ' 项'),
        h('button', {
          onclick: function () { S.trashOpen = false; render(); },
          style: { border: 'none', background: 'transparent', color: t.muted, cursor: 'pointer', fontSize: '15px' },
        }, '✕')
      ),
      h('div', { style: { flex: '1', overflow: 'auto', padding: '10px 12px' } },
        items.length ? items : h('div', {
          style: { padding: '28px 12px', textAlign: 'center', color: t.faint, fontSize: '12.5px' },
        }, '回收站为空')
      ),
      h('div', {
        style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: '1px solid ' + t.border },
      },
        h('button', {
          onclick: function () { emptyTrash(); },
          disabled: S.trash.length ? null : 'disabled',
          style: {
            border: '1px solid ' + t.border, background: t.surface, color: S.trash.length ? t.text : t.faint,
            cursor: S.trash.length ? 'pointer' : 'default',
            borderRadius: px(t.radius - 3), padding: '6px 14px', fontSize: '12.5px', fontWeight: '600', fontFamily: t.fontUI,
          },
        }, '清空')
      )
    );
    overlay.appendChild(panel);
    return overlay;
  }

  // ── cross-surface sync ───────────────────────────────────────────
  function isUserTyping() {
    const el = document.activeElement;
    return el && el.tagName === 'TEXTAREA';
  }

  function handleChange(changes) {
    if (suppressOnChange) return;
    let needRender = false;
    if (changes[window.MDStore.KEYS.theme]) {
      const nv = changes[window.MDStore.KEYS.theme].newValue;
      if (nv && nv !== S.themeId) { S.themeId = nv; needRender = true; }
    }
    if (changes[window.MDStore.KEYS.tree]) {
      const nv = changes[window.MDStore.KEYS.tree].newValue;
      // Don't clobber the textarea the user is actively typing in.
      if (nv && !isUserTyping()) { S.tree = nv; needRender = true; }
    }
    if (changes[window.MDStore.KEYS.active]) {
      const nv = changes[window.MDStore.KEYS.active].newValue;
      if (nv && nv !== S.active && !isUserTyping()) { S.active = nv; needRender = true; }
    }
    if (changes[window.MDStore.KEYS.trash]) {
      const nv = changes[window.MDStore.KEYS.trash].newValue;
      if (nv && !isUserTyping()) { S.trash = Array.isArray(nv) ? nv : []; needRender = true; }
    }
    if (needRender) render();
  }

  // ── bootstrap ────────────────────────────────────────────────────
  async function main() {
    try { document.title = 'Zedown 编辑器'; } catch (e) { /* noop */ }
    await window.MDStore.init();
    const [tree, theme, storedActive, trash] = await Promise.all([
      window.MDStore.getTree(),
      window.MDStore.getTheme(),
      window.MDStore.getActive(),
      window.MDStore.getTrash(),
    ]);
    S.tree = (tree && tree.length) ? tree : JSON.parse(JSON.stringify(window.MD_SAMPLE.TREE));
    S.themeId = theme || 'paper';
    S.trash = Array.isArray(trash) ? trash : [];

    // pick active: ?id= > stored > firstFile
    const params = new URLSearchParams(location.search);
    const qid = params.get('id');
    let active = null;
    if (qid && findNode(S.tree, qid)) active = qid;
    else if (storedActive && findNode(S.tree, storedActive)) active = storedActive;
    else active = firstFile(S.tree);
    S.active = active;
    if (active) persistActive(active);

    window.MDStore.onChange(handleChange);
    render();
  }

  main();

  // ── drag a file onto the editor → open it in reading mode (new reader tab) ──
  (function wireDropToReader() {
    const RE = /\.(md|markdown|txt|mdown|mkd)$/i;
    let ov = null;
    function overlay(show) {
      if (!ov) {
        ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:rgba(20,18,16,.55);backdrop-filter:blur(3px);font-family:system-ui,sans-serif;pointer-events:none;';
        const b = document.createElement('div');
        b.style.cssText = 'padding:26px 38px;border:2px dashed rgba(255,255,255,.7);border-radius:16px;color:#fff;font-size:17px;font-weight:600;text-align:center;';
        b.textContent = '松开以在阅读模式中打开';
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
