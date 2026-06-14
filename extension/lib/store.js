/* store.js — persistence layer + tree helpers, shared by every surface.
   Backed by chrome.storage.local so notes, theme and scratch survive across
   the side panel, the full editor and the reader. Exposes window.MDStore.

   Storage keys:
     md:tree    -> file/folder tree (array of nodes; files carry { body })
     md:theme   -> active theme id ('paper' | 'midnight' | 'indigo')
     md:active  -> active file id in the full editor
     md:scratch -> side-panel quick note (plain markdown string)

   Tree node shapes:
     file   { id, type:'file',   name, tag, updated, body }
     folder { id, type:'folder', name, open, children:[] }
*/
(function () {
  const K = { tree: 'md:tree', theme: 'md:theme', active: 'md:active', scratch: 'md:scratch', trash: 'md:trash' };

  // chrome.storage may be absent when a page is opened outside the extension
  // (e.g. file://). Fall back to localStorage so the surfaces still render.
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  function rawGet(keys) {
    if (hasChrome) return new Promise((res) => chrome.storage.local.get(keys, res));
    const out = {};
    (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
      try { const v = localStorage.getItem(k); if (v != null) out[k] = JSON.parse(v); } catch {}
    });
    return Promise.resolve(out);
  }
  function rawSet(obj) {
    if (hasChrome) return new Promise((res) => chrome.storage.local.set(obj, res));
    try { Object.keys(obj).forEach((k) => localStorage.setItem(k, JSON.stringify(obj[k]))); } catch {}
    return Promise.resolve();
  }

  // ── pure tree helpers (mirror the prototype) ───────────────────
  function findNode(nodes, id) {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) { const f = findNode(n.children, id); if (f) return f; }
    }
    return null;
  }
  function patchNode(nodes, id, patch) {
    return nodes.map((n) => {
      if (n.id === id) return Object.assign({}, n, patch);
      if (n.children) return Object.assign({}, n, { children: patchNode(n.children, id, patch) });
      return n;
    });
  }
  function removeNode(nodes, id) {
    return nodes.filter((n) => n.id !== id).map((n) =>
      n.children ? Object.assign({}, n, { children: removeNode(n.children, id) }) : n);
  }
  function addToFolder(nodes, folderId, child) {
    if (!folderId) return nodes.concat([child]);
    return nodes.map((n) => {
      if (n.id === folderId) return Object.assign({}, n, { open: true, children: (n.children || []).concat([child]) });
      if (n.children) return Object.assign({}, n, { children: addToFolder(n.children, folderId, child) });
      return n;
    });
  }
  function firstFile(nodes) {
    for (const n of nodes) {
      if (n.type === 'file') return n.id;
      if (n.children) { const f = firstFile(n.children); if (f) return f; }
    }
    return null;
  }
  function flatFiles(nodes, out) {
    out = out || [];
    nodes.forEach((n) => { if (n.type === 'file') out.push(n); if (n.children) flatFiles(n.children, out); });
    return out;
  }

  // ── trash + reorder helpers (pure: no Date/storage side effects) ─
  // Find a node and return a deep-ish clone for safe handoff to trash.
  function cloneNode(n) { return JSON.parse(JSON.stringify(n)); }

  // moveToTrash(tree, trashArr, id, ts) -> { tree, trash }
  // Removes the node (and its subtree) from the tree and pushes a copy onto a
  // fresh trash array, tagged with deletedAt = ts (caller supplies the epoch).
  function moveToTrash(tree, trashArr, id, ts) {
    const node = findNode(tree, id);
    if (!node) return { tree: tree, trash: (trashArr || []).slice() };
    const removed = Object.assign(cloneNode(node), { deletedAt: ts });
    return {
      tree: removeNode(tree, id),
      trash: (trashArr || []).slice().concat([removed]),
    };
  }

  // restoreFromTrash(tree, trashArr, id) -> { tree, trash }
  // Re-appends the trashed node to the tree root and drops it from trash.
  // The transient deletedAt tag is stripped on restore.
  function restoreFromTrash(tree, trashArr, id) {
    const arr = trashArr || [];
    const idx = arr.findIndex((n) => n && n.id === id);
    if (idx === -1) return { tree: tree, trash: arr.slice() };
    const node = cloneNode(arr[idx]);
    delete node.deletedAt;
    const trash = arr.slice(0, idx).concat(arr.slice(idx + 1));
    return { tree: tree.concat([node]), trash: trash };
  }

  // True if `ancestorId` is `id` itself or contains `id` somewhere below it.
  function isSelfOrDescendant(tree, ancestorId, id) {
    if (ancestorId === id) return true;
    const anc = findNode(tree, ancestorId);
    if (!anc || !anc.children) return false;
    return !!findNode(anc.children, id);
  }

  // reorderTree(tree, dragId, targetId, pos) -> tree (pure)
  // pos ∈ 'before' | 'after' | 'inside' ('inside' only for folder targets).
  // Returns the tree unchanged for invalid moves (missing nodes, dropping a
  // folder into its own descendant, or no-op self-drop).
  function reorderTree(tree, dragId, targetId, pos) {
    if (!dragId || !targetId || dragId === targetId) return tree;
    const drag = findNode(tree, dragId);
    const target = findNode(tree, targetId);
    if (!drag || !target) return tree;
    // Cannot drop a node into itself or one of its own descendants.
    if (isSelfOrDescendant(tree, dragId, targetId)) return tree;
    if (pos === 'inside' && target.type !== 'folder') return tree;

    const moving = cloneNode(drag);
    const pruned = removeNode(tree, dragId);

    if (pos === 'inside') {
      return insertInside(pruned, targetId, moving);
    }
    return insertBeside(pruned, targetId, moving, pos === 'after');
  }

  // Append `child` into the folder identified by folderId (opens it).
  function insertInside(nodes, folderId, child) {
    return nodes.map((n) => {
      if (n.id === folderId) {
        return Object.assign({}, n, { open: true, children: (n.children || []).concat([child]) });
      }
      if (n.children) return Object.assign({}, n, { children: insertInside(n.children, folderId, child) });
      return n;
    });
  }

  // Insert `node` before/after the sibling identified by targetId, at whatever
  // depth that sibling lives.
  function insertBeside(nodes, targetId, node, after) {
    const out = [];
    let placed = false;
    for (const n of nodes) {
      if (n.id === targetId) {
        if (after) { out.push(n); out.push(node); }
        else { out.push(node); out.push(n); }
        placed = true;
      } else if (n.children) {
        out.push(Object.assign({}, n, { children: insertBeside(n.children, targetId, node, after) }));
      } else {
        out.push(n);
      }
    }
    return out;
  }

  // ── seeding ────────────────────────────────────────────────────
  // Seeds defaults the first time the extension runs. Safe to call from any
  // surface; only writes keys that are missing.
  async function init() {
    const cur = await rawGet([K.tree, K.theme, K.active, K.scratch, K.trash]);
    const patch = {};
    const SAMPLE = (typeof window !== 'undefined' && window.MD_SAMPLE) || null;
    if (cur[K.tree] == null && SAMPLE) patch[K.tree] = JSON.parse(JSON.stringify(SAMPLE.TREE));
    if (cur[K.theme] == null) patch[K.theme] = 'paper';
    if (cur[K.active] == null) {
      const tree = patch[K.tree] || cur[K.tree] || [];
      patch[K.active] = firstFile(tree);
    }
    if (cur[K.scratch] == null && SAMPLE) patch[K.scratch] = SAMPLE.NOTE;
    if (cur[K.trash] == null) patch[K.trash] = [];
    if (Object.keys(patch).length) await rawSet(patch);
  }

  // ── typed accessors ────────────────────────────────────────────
  const get = (k, fallback) => rawGet(k).then((o) => (o[k] != null ? o[k] : fallback));

  const MDStore = {
    KEYS: K,
    // tree
    getTree: () => get(K.tree, []),
    setTree: (tree) => rawSet({ [K.tree]: tree }),
    // theme
    getTheme: () => get(K.theme, 'paper'),
    setTheme: (id) => rawSet({ [K.theme]: id }),
    // active file
    getActive: () => get(K.active, null),
    setActive: (id) => rawSet({ [K.active]: id }),
    // scratch
    getScratch: () => get(K.scratch, ''),
    setScratch: (text) => rawSet({ [K.scratch]: text }),
    // trash (回收站)
    getTrash: () => get(K.trash, []),
    setTrash: (arr) => rawSet({ [K.trash]: arr }),

    init,
    findNode, patchNode, removeNode, addToFolder, firstFile, flatFiles,
    moveToTrash, restoreFromTrash, reorderTree,

    // Subscribe to cross-surface changes. cb receives (changesByKey).
    onChange(cb) {
      if (!hasChrome || !chrome.storage.onChanged) return () => {};
      const handler = (changes, area) => { if (area === 'local') cb(changes); };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },

    // ── navigation helpers (open extension pages) ────────────────
    openEditor(activeId) {
      const url = chrome.runtime.getURL('editor/editor.html') + (activeId ? '?id=' + encodeURIComponent(activeId) : '');
      chrome.tabs.create({ url });
    },
    openReader(id) {
      const url = chrome.runtime.getURL('reader/reader.html') + (id ? '?id=' + encodeURIComponent(id) : '');
      chrome.tabs.create({ url });
    },
  };

  window.MDStore = MDStore;
})();
