# V2 build contract — additive to V1

Same hard rules as `CONTRACT.md`: **vanilla JS, MV3, no build, no remote/CDN, no eval, no inline `<script>`/`on*`**. All new shared libs are classic scripts that attach exports to **`globalThis`** (so both window pages AND the background service worker can use them via `importScripts`). Read V1 `CONTRACT.md` first. Every `.js` must pass `node --check`.

## File ownership (DO NOT edit a file you don't own — avoids parallel collisions)

### Foundation phase
- **render-lib** owns: `lib/highlight.js` (new), `lib/enhance.js` (new), `lib/md.js` (edit), `lib/themes.js` (edit)
- **data-lib** owns: `lib/zip.js` (new), `lib/export.js` (new), `lib/store.js` (edit)
- **web-lib** owns: `lib/html2md.js` (new), `manifest.json` (edit), `background.js` (edit)

### Surface phase (consume foundation; each owns only its surface files)
- **editor** owns: `editor/editor.js`, `editor/editor.html`
- **sidepanel** owns: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.html`
- **reader** owns: `reader/reader.js`, `reader/reader.html`, `lib/reader-view.js`

## Exact APIs

### lib/highlight.js → `globalThis.mdHighlight(code, lang) -> htmlString`
- Tokenizes `code` for langs: `js`,`ts`,`json`,`html`/`xml`,`css`,`bash`/`sh`,`python`/`py`,`http`,`md`,`sql`. Aliases ok. Unknown/empty lang → return HTML-escaped code unchanged.
- Wrap tokens in `<span class="tok-X">` where X ∈ `kw,str,num,com,fn,builtin,attr,tag,prop,punct,op,var`. MUST HTML-escape all text. Output is safe HTML (used as innerHTML).

### lib/md.js (edit) — keep `globalThis.mdToHtml(src)` signature
- Fenced code: if `globalThis.mdHighlight` exists AND lang present, set `<code data-lang="..." class="lang-...">` innerHTML to `mdHighlight(rawCode, lang)`; else current escaped behavior. Never break when highlight.js absent.
- **Footnotes**: parse `[^id]: definition` (block, may span continued lines) → collect; inline `[^id]` → `<sup class="fn-ref" id="fnref-ID"><a href="#fn-ID">[n]</a></sup>` numbered in order of first reference. Append `<section class="footnotes"><hr><ol>…<li id="fn-ID">def <a href="#fnref-ID">↩</a></li></ol></section>` at end if any. Escape ids for selectors.
- Keep current md.js attaching to `globalThis` (was `window`; `window` still works on pages, but switch to `globalThis` so SW-safe — note md.js is page-only so `window` is fine too; do whichever keeps tests green, prefer `globalThis`).

### lib/enhance.js → `globalThis.MDEnhance = { codeCopyButtons(proseEl), headingAnchors(proseEl) }`
- `codeCopyButtons(proseEl)`: for each `pre` in proseEl, inject a small "复制" button (absolutely positioned top-right) that copies the `code` textContent via `navigator.clipboard.writeText`, flips to "已复制" ~1.2s. Idempotent (don't double-add; mark with a dataset flag). Style with currentColor / inherit so it reads on any theme.
- `headingAnchors(proseEl)`: ensure each h1/h2/h3 has an id (slug); on hover show a "#" anchor link that copies `location.href#id` (or just sets location.hash). Idempotent.
- Pure DOM, no MDStore, no theme tokens required (use neutral inherited styles).

### lib/themes.js (edit) — extend `prose(id)` CSS
- Add per-theme token colors for `.theme-<id> .prose .tok-kw/.tok-str/.tok-num/.tok-com/.tok-fn/.tok-builtin/.tok-attr/.tok-tag/.tok-prop/.tok-op/.tok-var` (tasteful palette per theme: paper warm, midnight neon-on-dark, indigo cool). `.tok-com` muted/italic.
- Add `.prose pre{position:relative}` (if not already), `.prose .md-copy-btn{…}`, `.prose .footnotes{font-size:.85em;color:muted;…}`, `.prose .fn-ref a{…}`, `.prose .md-anchor{…}`. Keep auto-injection block intact.

### lib/store.js (edit) — keep all V1 API; ADD:
- `getTrash()/setTrash(arr)` backed by new key `md:trash` (add `trash:'md:trash'` to `KEYS`).
- `moveToTrash(tree, id) -> { tree, trash }` : removes node from tree, returns the removed node (with a `deletedAt` epoch via a passed-in timestamp arg `moveToTrash(tree, id, ts)`; do NOT call Date.now at import—accept ts param) pushed onto a fresh trash array copy. Signature: `moveToTrash(tree, trashArr, id, ts) -> { tree, trash }`.
- `restoreFromTrash(tree, trashArr, id) -> { tree, trash }` : re-appends node to tree root, removes from trash.
- `reorderTree(tree, dragId, targetId, pos) -> tree` : pure move of dragId to before/after/inside targetId. `pos` ∈ `'before'|'after'|'inside'` (inside only valid if target is a folder). Must not allow dropping a folder into its own descendant (return tree unchanged if invalid).
- Keep helpers pure (no Date/storage side effects).

### lib/zip.js → `globalThis.makeZip(files) -> Blob`
- `files`: `[{ name:string (may contain '/'), data:string|Uint8Array }]`. Produce a valid **stored (no compression)** ZIP Blob (`type:'application/zip'`) with correct local headers, CRC32, and central directory. UTF-8 filenames (set bit 11). No deflate. Self-contained.

### lib/export.js → `globalThis.MDExport`
- `noteToHtml(title, markdown, themeId) -> string`: a complete standalone HTML doc: `<style>` containing the prose CSS for that theme (read `globalThis.MD_PROSE_CSS`) + a `theme-<id>` wrapper + the `mdToHtml(markdown)` body + minimal page styles + token CSS. No external refs (fonts may use system fallback). 
- `download(blob, filename)`: anchor-click download + revoke.
- `noteToBlobMd(markdown) -> Blob` (text/markdown).
- (Print/PDF is done by the editor opening a print view + `window.print()`; export.js may provide `printHtml(htmlString)` that opens a hidden iframe/new window and prints — optional.)

### lib/html2md.js → `globalThis.htmlToMarkdown(htmlString) -> markdown`
- Parse with `DOMParser` (available in window pages). For the **service worker** (no DOMParser), html2md must ALSO work given a DOM node OR fall back: export `htmlToMarkdown(htmlOrNode)`. Since SW lacks DOMParser, the **page-side extraction** returns already-structured data — see web-lib clip flow below. To stay robust: html2md uses `DOMParser` if available; the SW path will instead receive Markdown already converted in the page (see below). So: `htmlToMarkdown` is primarily used where DOMParser exists.
- Handle: h1-6, p, br, strong/b, em/i, del/s, code, pre>code (fenced w/ lang from class), a[href], img[src,alt], ul/ol/li (nested), blockquote, hr, table (GFM). Strip script/style/nav/aside noise. Collapse whitespace sanely.

### manifest.json (edit)
- Add to `permissions`: `"scripting"`, `"activeTab"`. Keep `sidePanel`,`storage`,`contextMenus`.
- Do NOT add broad `host_permissions` (use `activeTab` — clip runs on the user-gesture click).

### background.js (edit) — clip flow
- `importScripts('lib/html2md.js')` at top so `htmlToMarkdown` is on `globalThis` in the SW. (Also `importScripts('lib/store.js')` is NOT safe—store.js touches `window`; instead do storage inline in SW with the `md:tree`/`md:trash` keys and a tiny inline tree-append.)
- Add an action/context flow "剪藏整页": on command or context menu, `chrome.scripting.executeScript({target:{tabId}, func: extractFn})` where `extractFn` runs in the page, finds main content (`article` → `main` → largest text block → body), clones, removes script/style/nav/aside/header/footer, and returns `{ title, html, url }`. Back in SW: `const md = htmlToMarkdown(html)` (SW has no DOMParser! so html2md must NOT need DOMParser in SW) — **to avoid the DOMParser problem, do the HTML→MD conversion INSIDE `extractFn` in the page** (inject a stringified converter, or `executeScript` a second func that returns markdown directly). Simplest: `extractFn` returns `{title,url,markdown}` by using a self-contained in-page converter. Put that converter logic in `extractFn` (self-contained, since injected funcs can't reference outer scope). You MAY duplicate a compact html→md inside extractFn.
- Save: read `md:tree`, ensure a folder `{id:'clip-web', type:'folder', name:'网页剪藏', open:true, children:[]}` exists, append `{ id:'clip'+ts, type:'file', name: title.slice(0,40)+'.md', tag: domain, updated:'刚刚', body: '# '+title+'\n\n> 来源: '+url+'\n\n'+markdown }`, write back. Open the side panel or editor optionally.
- Upgrade existing selection context-menu: keep plain-text fallback but if possible capture selection HTML (executeScript reading `getSelection().getRangeAt(0)` → container.innerHTML) and convert in-page to markdown, append to `md:scratch`.

## Surface wiring requirements
- **editor**: after rendering preview (`.prose` innerHTML), call `MDEnhance.codeCopyButtons(proseEl)` + `MDEnhance.headingAnchors(proseEl)`. Replace the single 导出 button with an **export menu**: 导出 .md / 导出 .html / 打印·PDF / 导出全部 .zip (uses MDExport + makeZip; .zip walks the tree building `folder/relative/path.md`). Add **slash command** `/` menu in the textarea (insert heading/list/todo/code/table/quote/divider). Add **smart editing** (Enter continues `- `/`* `/`1. `/`- [ ] ` and outdents on empty item; Tab/Shift+Tab indent selected lines; auto-pair `*` `` ` `` `[`; Cmd/Ctrl+K wraps selection as `[sel](url)`). Add **find&replace** panel toggled by Cmd/Ctrl+F (find) and Cmd/Ctrl+H (replace) operating on the active textarea, with next/prev/replace/replace-all. Convert delete to **回收站**: delete moves to trash (`MDStore.moveToTrash`, pass `Date.now()` from the surface), add a "回收站" affordance in the rail footer showing count, opening a small panel to 恢复/清空 (`restoreFromTrash`, `setTrash([])`). Make tree rows **drag-to-reorder** (pointer-based; on drop call `MDStore.reorderTree` and persist). 
- **sidepanel**: after preview innerHTML call `MDEnhance.codeCopyButtons`. Add a "剪藏整页" button in the header (next to 全屏) that messages the background to clip the active tab (`chrome.runtime.sendMessage({type:'clip-page'})`; background handles via the same clip flow using the sender tab / queried active tab). Optionally add the same slash/smart-editing to its textarea (reuse patterns; keep it lean). Show scratch as before.
- **reader / reader-view**: after building the `.prose`, call `MDEnhance.codeCopyButtons(proseRoot)` + `MDEnhance.headingAnchors(proseRoot)` so the reader gets copy buttons + footnote/anchor styling. No other behavior change.

## Load order additions (per surface HTML, after V1 libs, before surface script)
```
../lib/md.js, ../lib/highlight.js, ../lib/themes.js, ../lib/sample.js, ../lib/enhance.js, ../lib/store.js, ../lib/zip.js, ../lib/export.js, ../lib/html2md.js, [../lib/reader-view.js], ./<surface>.js
```
(highlight.js MUST load before md.js is *used*, but md.js only calls `globalThis.mdHighlight` at render time, so as long as both are loaded before the surface script runs render, order among libs is flexible. Keep highlight.js before themes/enhance for clarity.)
