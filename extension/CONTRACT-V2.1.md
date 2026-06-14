# V2.1 build contract — additive to V1 + V2

Same hard rules: **vanilla JS, MV3, no build, no NEW remote/CDN at runtime, no eval, no inline `<script>`/`on*`**. Vendored libs (KaTeX, Mermaid) are already downloaded under `lib/vendor/` and are CSP-safe (verified: no eval/Function/dynamic-import). Read `CONTRACT.md` + `CONTRACT-V2.md` first. Every `.js` must pass `node --check`.

Vendored assets (already present — just reference them, do NOT re-download):
- `lib/vendor/katex/katex.min.js` (global `katex`, `katex.renderToString`)
- `lib/vendor/katex/katex.min.css` (+ `lib/vendor/katex/fonts/*.woff2`, referenced relatively by the css)
- `lib/vendor/mermaid.min.js` (global `mermaid`)

## File ownership (no cross-edits)

### Foundation phase
- **render-lib** owns: `lib/md.js`, `lib/enhance.js`, `lib/themes.js`
- **sync-lib** owns: `lib/sync.js` (new), `manifest.json`, `background.js`
- **options** owns: `options/options.html` (new), `options/options.js` (new)

### Surface phase
- **editor** owns: `editor/editor.js`, `editor/editor.html`
- **sidepanel** owns: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.html`
- **reader** owns: `reader/reader.js`, `reader/reader.html`, `lib/reader-view.js`

## Exact APIs

### lib/md.js (edit) — keep `globalThis.mdToHtml(src)`; ADD math + mermaid
- **Math** (only when `globalThis.katex` present; else leave the raw text escaped):
  - Display: a line/block of `$$ … $$` (may span multiple lines) → `katex.renderToString(tex, { displayMode:true, throwOnError:false })`, emitted as a block (wrap output in `<div class="md-math-display">`). Handle it at the BLOCK level (own block, like fenced code) so its TeX is never run through markdown inline.
  - Inline: `$…$` inside text → `katex.renderToString(tex, { displayMode:false, throwOnError:false })`. Must be handled in `inline()` as a token BEFORE emphasis/code so TeX `_ * \` are not mangled. Heuristics: opening `$` not followed by whitespace/digit-grouping ambiguity; closing `$` not preceded by whitespace; ignore `$$`; a `\$` is a literal dollar.
  - KaTeX output is trusted HTML — append raw (do NOT re-escape). Wrap try/catch; on throw, fall back to the escaped literal.
- **Mermaid**: fenced code with lang exactly `mermaid` → DO NOT highlight; emit
  `<div class="md-mermaid" data-mermaid="ESCAPED_SOURCE"><pre class="md-mermaid-src">ESCAPED_SOURCE</pre></div>`
  (the `<pre>` is the visible fallback until enhance renders the SVG). Escape the source for both the attribute and the pre text.
- Keep all V1/V2 behavior (footnotes, highlight, tables…). Resilient when katex/mermaid absent.

### lib/enhance.js (edit) — keep `MDEnhance.codeCopyButtons/headingAnchors`; ADD:
- `MDEnhance.renderMermaid(proseEl, themeId)`: init mermaid once per page (`mermaid.initialize({ startOnLoad:false, securityLevel:'strict', theme: themeId==='midnight'?'dark':'default' })`; re-init if themeId changed). For each `.md-mermaid` not yet processed (use a dataset flag), read `data-mermaid`, call `await mermaid.render('mmd-'+unique, src)`, and on success replace the node's content with the returned `svg` (hide/remove the fallback `<pre>`); on error keep the `<pre>` fallback and add a `.md-mermaid-error` class. Never throw out of renderMermaid (catch all). Guard when `globalThis.mermaid` absent (no-op). Unique ids must not use Math.random at module top — derive from an incrementing counter.
- KaTeX needs NO enhance step (md.js already produced final HTML), but the page MUST link `katex.min.css`.

### lib/themes.js (edit) — extend `prose(id)` CSS (keep everything prior)
- `.md-math-display{overflow-x:auto;margin:1em 0;text-align:center;}`
- `.md-mermaid{margin:1em 0;text-align:center;}` `.md-mermaid svg{max-width:100%;height:auto;}`
- `.md-mermaid-src{/* shown as fallback */}` and when rendered, hide it (renderMermaid removes/hides it; also a `.md-mermaid[data-rendered] .md-mermaid-src{display:none}` rule is fine).
- `.md-mermaid-error{/* subtle error border using token colors */}`
- Do not break the auto-inject block.

### lib/sync.js → `globalThis.MDSync` (SW-safe: globalThis + fetch + chrome.storage only; NO window/DOM)
Config keys in chrome.storage.local: `md:sync:token`, `md:sync:gistId`, `md:sync:auto` (bool), `md:sync:last` (epoch).
- `getConfig() -> { token, gistId, auto, last }`, `setConfig(patch) -> Promise`.
- `status() -> { configured:!!token, gistId, auto, last }`.
- `pushAll(ts) -> { ok, gistId, at, error }`: snapshot `{ version:1, updatedAt:ts, tree, scratch, theme, trash }` from chrome.storage; write to a gist file `omarkdown-backup.json`. If no gistId → `POST https://api.github.com/gists` (private, description "oMarkdown backup"), store returned id; else `PATCH https://api.github.com/gists/{id}`. Header `Authorization: token <token>`, `Accept: application/vnd.github+json`. Update `md:sync:last`. (Accept `ts` as a param; do not call Date.now inside a pure path — but pushAll/pullAll are allowed to read it from caller.)
- `pullAll() -> { ok, at, error }`: `GET https://api.github.com/gists/{id}`, parse `files['omarkdown-backup.json'].content` JSON, write `tree/scratch/theme/trash` into chrome.storage.local (only keys present). Update `md:sync:last`.
- `testConnection() -> { ok, login, error }`: `GET https://api.github.com/user`.
- Last-write-wins; document that push overwrites remote, pull overwrites local. No 3-way merge in V2.1.
- All network errors caught → `{ ok:false, error }`.

### manifest.json (edit)
- Add `"alarms"` to permissions. Add `"host_permissions": ["https://api.github.com/*"]`. Add `"options_page": "options/options.html"`. Keep V2 perms (sidePanel, storage, contextMenus, scripting, activeTab). Keep CSP.

### background.js (edit) — keep all V1/V2 clip logic; ADD sync
- `importScripts('lib/sync.js')` (sync.js is SW-safe). 
- On install/startup: if `auto` config on, attempt `MDSync.pullAll()` (best-effort, catch). Create a `chrome.alarms` ('md-sync', periodInMinutes ~5); on alarm, if `auto`, `MDSync.pushAll(Date.now())` (catch).
- `chrome.runtime.onMessage`: handle `{type:'sync-push'}` → pushAll, `{type:'sync-pull'}` → pullAll, `{type:'sync-status'}` → status; reply via sendResponse, `return true`. Keep the existing `clip-page` handler working (one combined listener or separate listeners both returning true appropriately).

### options/options.html + options.js (new)
- Load `../lib/themes.js`, `../lib/store.js`, `../lib/sync.js`, `./options.js` (CONTRACT order; surface script last). No inline script/handlers.
- Themed using `MD_TOKENS[await MDStore.getTheme()]`, root `theme-<id>`.
- Form: GitHub Token (password field, gist scope hint + link to create token), Gist ID (optional, auto-filled after first push), Auto-sync checkbox. Buttons: 保存设置 (setConfig), 测试连接 (MDSync.testConnection → show login), 立即推送 (pushAll), 立即拉取 (pullAll, with a confirm since it overwrites local). Status line: configured?, gist link (`https://gist.github.com/{id}`), 上次同步 time. Show success/error inline. Don't log the token.

## Surface wiring
- **editor**: editor.html add `<link rel="stylesheet" href="../lib/vendor/katex/katex.min.css">` and scripts `../lib/vendor/katex/katex.min.js`, `../lib/vendor/mermaid.min.js`, `../lib/sync.js` (before editor.js; katex/mermaid before md.js is *used*). After every preview `.prose` render call `MDEnhance.renderMermaid(proseEl, S.themeId)` (in addition to existing codeCopyButtons/headingAnchors). Add a cloud-sync affordance: a small ☁ button in the top bar (next to 导出) that runs `chrome.runtime.sendMessage({type:'sync-push'}, cb)` showing 同步中…/已同步/失败, plus an entry to open settings via `chrome.runtime.openOptionsPage()` (e.g. a ⚙ button or a menu item). Show 上次同步 from status. Keep ALL prior editor behavior.
- **sidepanel**: sidepanel.html add katex css + katex.min.js + mermaid.min.js (sync.js optional). After preview render call `MDEnhance.renderMermaid(proseEl, themeId)`. (A sync indicator is optional; keep it lean.) Keep all prior behavior.
- **reader / reader-view**: reader.html add katex css + katex.min.js + mermaid.min.js. In reader-view.js, after building `.prose` and running existing enhancers, call `MDEnhance.renderMermaid(prose, themeId)` and re-run it on theme change (setTheme rebuild already re-runs build → fine). KaTeX auto via md.js. Keep all prior behavior.

## Load order (per surface HTML)
`vendor/katex/katex.min.css (link)`, then scripts: `md.js, highlight.js, vendor/katex/katex.min.js, vendor/mermaid.min.js, themes.js, sample.js, enhance.js, store.js, [zip.js, export.js, html2md.js], [sync.js], [reader-view.js], ./<surface>.js`. (katex/mermaid just need to be loaded before the surface triggers a render.)
