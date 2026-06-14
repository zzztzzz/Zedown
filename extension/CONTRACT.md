# Build contract for the Markdown extension surfaces

All three surfaces (side panel, full editor, reader) are **vanilla JS, no build step, no React, no Babel, no remote resources** — they must load directly via Chrome "Load unpacked". This is Manifest V3: the CSP forbids inline `<script>`, `eval`, and remote script. All JS lives in external `.js` files referenced with `<script src>`. No inline event handlers in HTML (`onclick=`); wire events in JS.

## Source of truth
- **Visual & behavioral fidelity:** port faithfully from the prototype in `C:\work\md-plugin\design-src\`:
  - `comp_5520dcd4.jsx` → side panel (`MDSidePanel`)
  - `comp_d4180719.jsx` → full editor (`MDFullEditor`)
  - `comp_b1746cba.jsx` → reader (`MDReader`)
  Reproduce the same layout, spacing, colors, copy (Chinese labels), toolbar buttons, view modes, footer, etc. Convert React/JSX to direct DOM construction.

## Shared libs (already built — load, don't reimplement)
Load order in every surface HTML `<head>`:
```html
<link rel="stylesheet" href="../fonts/fonts.css">
<script src="../lib/md.js"></script>      <!-- window.mdToHtml(src) -> html -->
<script src="../lib/themes.js"></script>  <!-- window.MD_TOKENS, MD_THEMES; auto-injects prose CSS -->
<script src="../lib/sample.js"></script>  <!-- window.MD_SAMPLE: { NOTE, FILES, ARTICLE, TREE } -->
<script src="../lib/store.js"></script>   <!-- window.MDStore (async persistence + tree helpers) -->
<script src="./<surface>.js"></script>
```

## Theming
- `const T = window.MD_TOKENS;` then `const t = T[themeId];` — use token fields (`t.app, t.surface, t.surface2, t.border, t.borderStrong, t.text, t.muted, t.faint, t.accent, t.accentText, t.accentSoft, t.codeBg, t.codeText, t.fontUI, t.fontHead, t.fontMono, t.radius, t.shadow`) as inline styles, exactly as the prototype does.
- The **root element of each surface must have class `theme-<themeId>`** (e.g. `theme-paper`) so the auto-injected `.theme-<id> .prose` CSS styles rendered markdown. Re-render / re-class when theme changes.
- Rendered markdown goes in a `<div class="prose">` with `innerHTML = window.mdToHtml(text)`.

## Persistence (window.MDStore — all async, Promise-based)
Call `await MDStore.init()` once on load (seeds sample data + default theme).
- `getTree()/setTree(tree)` — full file/folder tree
- `getTheme()/setTheme(id)` — 'paper' | 'midnight' | 'indigo'
- `getActive()/setActive(id)` — active file id (editor)
- `getScratch()/setScratch(text)` — side-panel quick note
- pure helpers: `findNode, patchNode, removeNode, addToFolder, firstFile, flatFiles`
- `onChange(cb)` — cb(changes) on cross-surface storage updates (keep surfaces in sync)
- `openEditor(activeId?)`, `openReader(id?)` — open extension pages in a new tab

Node shapes: file `{ id, type:'file', name, tag, updated, body }`, folder `{ id, type:'folder', name, open, children:[] }`.

## Surface-specific notes
- **Side panel** (`sidepanel/sidepanel.html`, `sidepanel/sidepanel.js`): edits the **scratch** note (`MDStore.getScratch/setScratch`), debounced autosave (~900ms) with the "已保存到本地 / 编辑中…" footer dot. edit/preview segmented toggle, formatting toolbar (B/I/`</>`/H/•/❝/☑) using textarea selection wrap, word count. Header has an icon to open the full editor (`MDStore.openEditor()`). Theme comes from `MDStore.getTheme()`, listen via `onChange`.
- **Full editor** (`editor/editor.html`, `editor/editor.js`): the file rail (tree with folders, +menu: new note / new folder / import .md, search, rename inline, delete, theme dots), top bar (title/meta, edit/split/read segmented, 导出 button that downloads current note as `.md`, a primary button to open the reader). `read` mode hands off to the reader **inline within the page** (render the same reader UI) — or open `MDStore.openReader(activeId)`; inline is preferred to match the prototype. Persist tree via `setTree` (debounced), persist active id via `setActive`. Read `?id=` query param to pick the initial active file. Sync from `onChange`.
- **Reader** (`reader/reader.html`, `reader/reader.js`): read-only render of a note, auto TOC from h1/h2/h3 with scroll-spy, reading-progress bar, A-/A+ font size, theme dots, 编辑 button → `MDStore.openEditor(id)`. Read `?id=` query param; fall back to `MD_SAMPLE.ARTICLE`. Also usable as a component the editor embeds for `read` mode.

## Quality bar
- No console errors on load. No external network calls. Buttons all functional.
- Match the prototype's Chinese UI copy exactly.
- Keep each surface self-contained; shared logic already lives in `lib/`.
