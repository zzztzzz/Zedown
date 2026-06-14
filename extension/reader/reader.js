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

  function mount(themeId, note, id) {
    if (handle) { handle.destroy(); handle = null; }
    currentId = id;
    currentNote = note;
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

  async function start() {
    await MDStore.init();
    const id = getParam('id');
    const tree = await MDStore.getTree();
    const themeId = await MDStore.getTheme();
    const note = resolveNote(tree, id);
    mount(themeId, note, id);

    // Keep theme (and note content) in sync across surfaces.
    MDStore.onChange(async function (changes) {
      if (changes[MDStore.KEYS.theme]) {
        const newTheme = changes[MDStore.KEYS.theme].newValue;
        if (newTheme && handle && newTheme !== appliedTheme) {
          appliedTheme = newTheme;
          handle.setTheme(newTheme);
        }
      }
      if (changes[MDStore.KEYS.tree]) {
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
