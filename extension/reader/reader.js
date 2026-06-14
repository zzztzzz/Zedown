/* reader.js — standalone reader page. Resolves the note from MDStore by the
   ?id= query param (falling back to the sample article), then mounts the
   reusable MDReaderView into #root. Keeps theme in sync via MDStore.onChange. */
(function () {
  const root = document.getElementById('root');

  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // Resolve { content, title } for the requested id, or the sample fallback.
  function resolveNote(tree, id) {
    if (id) {
      const node = MDStore.findNode(tree, id);
      if (node && node.type === 'file') {
        return { content: node.body || '', title: node.name || '未命名' };
      }
    }
    return { content: window.MD_SAMPLE.ARTICLE, title: '排版指南.md' };
  }

  let handle = null;
  let currentId = null;
  let currentNote = null;
  let appliedTheme = null;
  let transient = false; // showing a dropped/standalone doc not backed by the tree

  function mount(themeId, note, id) {
    if (handle) { handle.destroy(); handle = null; }
    currentId = id;
    currentNote = note;
    transient = !id; // dropped docs have no tree id
    appliedTheme = themeId;
    document.title = note.title;
    handle = window.MDReaderView(root, {
      themeId: themeId,
      content: note.content,
      title: note.title,
      onEdit: function () { MDStore.openEditor(id || undefined); },
      onTheme: function (newId) {
        if (newId === appliedTheme) return;
        appliedTheme = newId;
        // Re-theme the existing view in place (preserves font scale); persist
        // so other surfaces follow. The onChange echo is a no-op (theme equal).
        handle.setTheme(newId);
        MDStore.setTheme(newId);
      },
    });
  }

  // ── drag & drop: drop a .md/.markdown/.txt file anywhere to read it ──
  const RE_TEXT = /\.(md|markdown|txt|mdown|mkd)$/i;
  let overlay = null;
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;' +
      'background:rgba(20,18,16,.55);backdrop-filter:blur(3px);font-family:system-ui,sans-serif;pointer-events:none;';
    const box = document.createElement('div');
    box.style.cssText = 'padding:28px 40px;border:2px dashed rgba(255,255,255,.7);border-radius:16px;color:#fff;font-size:18px;font-weight:600;text-align:center;';
    box.textContent = '松开以在 Zedown 中阅读';
    const sub = document.createElement('div');
    sub.style.cssText = 'margin-top:8px;font-size:13px;font-weight:400;opacity:.8;';
    sub.textContent = '.md · .markdown · .txt';
    box.appendChild(sub);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return overlay;
  }
  function showOverlay() { ensureOverlay().style.display = 'flex'; }
  function hideOverlay() { if (overlay) overlay.style.display = 'none'; }
  function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1; }

  async function readDropped(files) {
    const list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    // prefer a markdown/text file by extension; else just take the first
    let file = list.filter(function (f) { return RE_TEXT.test(f.name); })[0] || list[0];
    let text = '';
    try { text = await file.text(); } catch (e) { return; }
    const themeId = appliedTheme || await MDStore.getTheme();
    mount(themeId, { content: text, title: file.name || '拖入的文档' }, null);
  }

  function wireDnD() {
    window.addEventListener('dragenter', function (e) { if (hasFiles(e)) { e.preventDefault(); showOverlay(); } });
    window.addEventListener('dragover', function (e) { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; showOverlay(); } });
    window.addEventListener('dragleave', function (e) { if (e.relatedTarget === null) hideOverlay(); });
    window.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); hideOverlay();
      readDropped(e.dataTransfer.files);
    });
  }

  async function start() {
    await MDStore.init();
    wireDnD();
    const id = getParam('id');
    const src = getParam('src');
    const themeId = await MDStore.getTheme();

    // Handoff: a file dropped onto another surface was stashed for us to read.
    if (src === 'drop') {
      const doc = await MDStore.getDropDoc();
      MDStore.clearDropDoc();
      if (doc && doc.body != null) {
        mount(themeId, { content: doc.body, title: doc.name || '拖入的文档' }, null);
        wireSync();
        return;
      }
    }

    const tree = await MDStore.getTree();
    const note = resolveNote(tree, id);
    mount(themeId, note, id);
    wireSync();
  }

  function wireSync() {

    // Keep theme (and note content) in sync across surfaces.
    MDStore.onChange(async function (changes) {
      if (changes[MDStore.KEYS.theme]) {
        const newTheme = changes[MDStore.KEYS.theme].newValue;
        if (newTheme && handle && newTheme !== appliedTheme) {
          appliedTheme = newTheme;
          handle.setTheme(newTheme);
        }
      }
      if (changes[MDStore.KEYS.tree] && !transient) {
        const newTree = await MDStore.getTree();
        const fresh = resolveNote(newTree, currentId);
        if (fresh.content !== currentNote.content || fresh.title !== currentNote.title) {
          const tid = await MDStore.getTheme();
          mount(tid, fresh, currentId);
        }
      }
    });
  }

  start();
})();
