/* export.js — note export helpers. Classic script: attaches globalThis.MDExport.
   Produces standalone HTML, plain-markdown blobs, browser downloads, and an
   optional print path. Depends on globalThis.mdToHtml (md.js) and
   globalThis.MD_PROSE_CSS (themes.js) at call time — never at import.

   API (globalThis.MDExport):
     noteToHtml(title, markdown, themeId) -> string   (complete standalone doc)
     download(blob, filename)                          (anchor-click + revoke)
     noteToBlobMd(markdown) -> Blob                    (text/markdown)
     printHtml(htmlString)                             (open + window.print; optional)
*/
(function () {
  'use strict';

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Minimal page chrome so the exported file looks like the prose surface even
  // without the extension's UI. Uses system font fallbacks (no external refs).
  var PAGE_CSS = [
    '*{box-sizing:border-box;}',
    'html,body{margin:0;padding:0;}',
    'body{display:flex;justify-content:center;background:#f5f3ee;',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",',
    '"PingFang SC","Microsoft YaHei",sans-serif;color:#1c1a17;}',
    '.md-export-page{width:100%;max-width:780px;padding:48px 32px 96px;}',
    '.prose{line-height:1.7;}',
    '@media print{body{background:#fff;}.md-export-page{padding:0;max-width:none;}}'
  ].join('');

  function proseCss() {
    var css = (typeof globalThis !== 'undefined' && globalThis.MD_PROSE_CSS) ||
              (typeof window !== 'undefined' && window.MD_PROSE_CSS) || '';
    return css;
  }

  function renderBody(markdown) {
    var toHtml = (typeof globalThis !== 'undefined' && globalThis.mdToHtml) ||
                 (typeof window !== 'undefined' && window.mdToHtml) || null;
    if (toHtml) return toHtml(String(markdown == null ? '' : markdown));
    // Fallback: escaped <pre> so export never throws if md.js is absent.
    return '<pre>' + escHtml(markdown) + '</pre>';
  }

  function noteToHtml(title, markdown, themeId) {
    var id = themeId || 'paper';
    var body = renderBody(markdown);
    return [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + escHtml(title || '未命名') + '</title>',
      '<style>',
      PAGE_CSS,
      proseCss(),
      '</style>',
      '</head>',
      '<body class="theme-' + escHtml(id) + '">',
      '<main class="md-export-page">',
      '<article class="prose">' + body + '</article>',
      '</main>',
      '</body>',
      '</html>'
    ].join('\n');
  }

  function noteToBlobMd(markdown) {
    return new Blob([String(markdown == null ? '' : markdown)], { type: 'text/markdown' });
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    // Revoke after a tick so the navigation/download has started.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Optional: open the HTML in a hidden iframe and print it. Falls back to a
  // new window if iframe printing is unavailable.
  function printHtml(htmlString) {
    var iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    var doc = iframe.contentWindow && iframe.contentWindow.document;
    if (!doc) {
      // Fallback: new window.
      var w = window.open('', '_blank');
      if (w) { w.document.write(htmlString); w.document.close(); w.focus(); w.print(); }
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(htmlString);
    doc.close();

    var win = iframe.contentWindow;
    var run = function () {
      win.focus();
      win.print();
      setTimeout(function () { iframe.remove(); }, 1000);
    };
    // Give the iframe a beat to lay out before printing.
    if (doc.readyState === 'complete') setTimeout(run, 100);
    else iframe.onload = function () { setTimeout(run, 100); };
  }

  globalThis.MDExport = {
    noteToHtml: noteToHtml,
    noteToBlobMd: noteToBlobMd,
    download: download,
    printHtml: printHtml
  };
})();
