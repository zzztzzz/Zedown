/* content/mdview.js — auto-render local Markdown files with the Zedown reader.
   Runs as a content script on file:///*.md (and similar) pages: Chrome shows
   such files as raw text; we grab that text and replace the page with the full
   Zedown reading view (TOC, progress, font size, theme).

   Requires the user to enable "Allow access to file URLs" for the extension
   (chrome://extensions → Zedown → details). Reuses md.js / highlight.js /
   themes.js / enhance.js / reader-view.js (injected before this script). */
(function () {
  'use strict';
  if (window.__zedownMdView) return;            // guard against double-run
  window.__zedownMdView = true;

  if (typeof window.MDReaderView !== 'function') return; // libs missing → bail

  // Only transform plain-text/markdown documents (skip HTML served at a .md URL).
  var ct = (document.contentType || '').toLowerCase();
  if (ct && ct.indexOf('html') > -1) return;

  var raw = '';
  try { raw = (document.body && (document.body.innerText || document.body.textContent)) || ''; } catch (e) { raw = ''; }
  if (!raw || !raw.trim()) return;

  var title = 'Markdown';
  try { title = decodeURIComponent((location.pathname.split('/').pop() || '').trim()) || 'Markdown'; } catch (e) {}

  function mount(themeId) {
    if (!window.MD_TOKENS[themeId]) themeId = 'paper';
    try {
      document.documentElement.style.height = '100%';
      document.body.style.margin = '0';
      document.body.style.height = '100%';
      document.body.style.overflow = 'hidden';
      document.body.textContent = '';
    } catch (e) { return; }
    var root = document.createElement('div');
    root.id = 'zedown-md-root';
    root.style.cssText = 'position:fixed;inset:0;';
    document.body.appendChild(root);
    document.title = title;

    var handle = window.MDReaderView(root, {
      themeId: themeId,
      content: raw,
      title: title,
      onTheme: function (id) {
        try { chrome.storage.local.set({ 'md:theme': id }); } catch (e) {}
        if (handle) handle.setTheme(id);
      },
    });
  }

  // Honor the user's chosen theme; default to paper.
  try {
    chrome.storage.local.get('md:theme', function (r) {
      mount((r && r['md:theme']) || 'paper');
    });
  } catch (e) {
    mount('paper');
  }
})();
