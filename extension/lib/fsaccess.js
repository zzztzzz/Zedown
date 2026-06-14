/* lib/fsaccess.js — real local file / folder access via the File System Access
   API, with write-back to the ORIGINAL file. Page-only (full editor tab); the
   side panel can't use the picker. Exposes window.MDFs.

   File/dir handles aren't JSON-serializable but ARE structured-cloneable, so we
   persist them in IndexedDB (per-extension-origin, shared across extension
   pages). chrome.storage keeps only metadata + a `fh` (handle id) on the node.

   Browser security: a persisted handle needs permission re-granted (read or
   readwrite) once per page session, via a user gesture (requestPermission).

   API (all async unless noted):
     available()                      -> bool (feature detect)
     openFiles()                      -> [{ name, text, handleId }]
     openDirectory()                  -> { name, children } | null
        children: file { kind:'file', name, text, handleId }
                  dir  { kind:'dir',  name, children:[...] }
     read(handleId)                   -> { ok, text?, error?, needPermission? }
     write(handleId, text)            -> { ok, error?, needPermission? }
     grant(handleId, write=true)      -> bool   (call inside a user gesture)
     permState(handleId, write=true)  -> 'granted'|'prompt'|'denied'|'missing'
     del(handleId)                    -> void   (drops the stored handle only)
*/
(function () {
  'use strict';

  var MD_TYPES = [{
    description: 'Markdown / 文本',
    accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] },
  }];
  var RE_TEXT = /\.(md|markdown|txt)$/i;

  function available() {
    return typeof window !== 'undefined' &&
      typeof window.showOpenFilePicker === 'function' &&
      typeof window.showDirectoryPicker === 'function';
  }

  // ── IndexedDB handle store ───────────────────────────────────────
  var DB_NAME = 'mdkit-fs', STORE = 'handles', _dbp = null;
  function db() {
    if (_dbp) return _dbp;
    _dbp = new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
    return _dbp;
  }
  function idbPut(key, val) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).get(key);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }
  function idbDel(key) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { res(); };
      });
    });
  }

  var _seq = 0;
  function genId() { _seq++; return 'fh_' + Date.now().toString(36) + '_' + _seq + '_' + Math.random().toString(36).slice(2, 7); }

  // ── permissions ──────────────────────────────────────────────────
  function ensurePerm(handle, write, mayPrompt) {
    var opts = { mode: write ? 'readwrite' : 'read' };
    return Promise.resolve(handle.queryPermission ? handle.queryPermission(opts) : 'granted').then(function (st) {
      if (st === 'granted') return true;
      if (!mayPrompt || !handle.requestPermission) return false;
      return handle.requestPermission(opts).then(function (r) { return r === 'granted'; });
    }).catch(function () { return false; });
  }

  // ── open file(s) ─────────────────────────────────────────────────
  function openFiles() {
    if (!available()) return Promise.resolve([]);
    return window.showOpenFilePicker({ multiple: true, types: MD_TYPES, excludeAcceptAllOption: false })
      .then(function (handles) {
        return Promise.all(handles.map(function (h) {
          return h.getFile().then(function (f) {
            return f.text().then(function (text) {
              var id = genId();
              return idbPut(id, h).then(function () { return { name: f.name, text: text, handleId: id }; });
            });
          });
        }));
      })
      .catch(function () { return []; }); // user cancelled or error
  }

  // ── open directory (recursive) ───────────────────────────────────
  function readDir(dirHandle) {
    var out = [];
    return (async function () {
      for await (var entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          if (!RE_TEXT.test(entry.name)) continue;
          try {
            var f = await entry.getFile();
            var text = await f.text();
            var id = genId();
            await idbPut(id, entry);
            out.push({ kind: 'file', name: entry.name, text: text, handleId: id });
          } catch (e) { /* skip unreadable */ }
        } else if (entry.kind === 'directory') {
          try {
            var kids = await readDir(entry);
            if (kids.length) out.push({ kind: 'dir', name: entry.name, children: kids });
          } catch (e) { /* skip */ }
        }
      }
      // folders first, then files, each alphabetical — stable, tidy tree
      out.sort(function (a, b) {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return out;
    })();
  }
  function openDirectory() {
    if (!available()) return Promise.resolve(null);
    return window.showDirectoryPicker().then(function (dh) {
      return readDir(dh).then(function (children) { return { name: dh.name, children: children }; });
    }).catch(function () { return null; });
  }

  // ── read / write a stored handle ─────────────────────────────────
  function read(handleId) {
    return idbGet(handleId).then(function (h) {
      if (!h) return { ok: false, error: 'missing' };
      return ensurePerm(h, false, true).then(function (ok) {
        if (!ok) return { ok: false, needPermission: true };
        return h.getFile().then(function (f) { return f.text(); }).then(function (text) { return { ok: true, text: text }; });
      });
    }).catch(function (e) { return { ok: false, error: String((e && e.message) || e) }; });
  }
  function write(handleId, text) {
    return idbGet(handleId).then(function (h) {
      if (!h) return { ok: false, error: 'missing' };
      return ensurePerm(h, true, true).then(function (ok) {
        if (!ok) return { ok: false, needPermission: true };
        return h.createWritable().then(function (w) {
          return w.write(text).then(function () { return w.close(); }).then(function () { return { ok: true }; });
        });
      });
    }).catch(function (e) { return { ok: false, error: String((e && e.message) || e) }; });
  }

  function grant(handleId, write) {
    return idbGet(handleId).then(function (h) {
      if (!h) return false;
      return ensurePerm(h, write !== false, true);
    }).catch(function () { return false; });
  }
  function permState(handleId, write) {
    return idbGet(handleId).then(function (h) {
      if (!h) return 'missing';
      var opts = { mode: write !== false ? 'readwrite' : 'read' };
      return Promise.resolve(h.queryPermission ? h.queryPermission(opts) : 'granted');
    }).catch(function () { return 'missing'; });
  }
  function del(handleId) { return idbDel(handleId); }

  window.MDFs = {
    available: available,
    openFiles: openFiles,
    openDirectory: openDirectory,
    read: read,
    write: write,
    grant: grant,
    permState: permState,
    del: del,
  };
})();
