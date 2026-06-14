# V3 build contract — additive to V1 + V2 + V2.1

Same hard rules: **vanilla JS, MV3, no build, no new remote/CDN at runtime, no eval, no inline `<script>`/`on*`**. Read CONTRACT.md / V2 / V2.1 first. Every `.js` must pass `node --check`.

V3 = **merge the V3 design's new features onto the existing V2.1 production code** (do NOT remove V2/V2.1 features: syntax highlight, footnotes, code-copy, anchors, zip export, recycle bin, drag-reorder, find/replace, slash commands, clip, local backup). The V3 design prototype lives in `C:\work\md-plugin\extension` design refs under the unpacked `C:\tmp\v3\` (FullEditor.jsx, SidePanel.jsx, MDReader.jsx, Shortcuts.jsx). Match its NEW behaviors/visuals; keep everything else intact.

Foundation already done (do not re-create):
- `lib/shortcuts.js` — `window.MDShortcuts.create()` controller, `window.MD_comboFromEvent`, `window.MD_fmtCombo`, `window.MDShortcutsPanel(t, controller, onClose)` (returns a modal DOM element with `_destroy()`).
- `lib/sample.js` — now exports `TUTORIAL` and seeds it as the first tree file (`📖 Markdown 使用教程.md`), demonstrating `$E=mc^2$`, `$$…$$`, ```mermaid.
- `manifest.json` — renamed to **Zedown**.

The existing math/mermaid pipeline (V2.1: md.js inline `$…$`/`$$…$$` via KaTeX, ` ```mermaid ` → `MDEnhance.renderMermaid`) STAYS — do not switch to the prototype's `.math-block` placeholder markup. The TUTORIAL already renders with the current pipeline. Surfaces keep calling the existing enhancers after preview render.

## File ownership (single-owner; no cross-edits)
- **editor** owns: `editor/editor.js`, `editor/editor.html`
- **sidepanel** owns: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.html`
- **reader** owns: `reader/reader.js`, `reader/reader.html`, `lib/reader-view.js`

## Rebrand (ALL surfaces)
- Brand name **"Zedown"**, brand letter **"Z"** in the logo tile (was "Markdown"/"M"). Apply in every header/logo and `document.title` (e.g. editor tab title "Zedown 编辑器", reader title stays the note name).

## editor (merge V3 into existing editor.js)
Add these V3 features WITHOUT removing existing ones:
1. **Keyboard shortcuts**: `const sc = window.MDShortcuts.create();` once. In the textarea keydown handler, FIRST `const id = sc.matchAction(e); if (id) { e.preventDefault(); runAction(id); return; }`. Implement `runAction(id)` for: bold(`**`)/italic(`*`)/code(`` ` ``) wrap; link → insert `[sel](https://)` selecting the url; heading/list/task/quote → line-prefix (`## `,`- `,`- [ ] `,`> `); save → force-save indicator; toggleSplit → edit⇄split; reading → read mode; shortcuts → open the panel. Keep existing find/replace (Cmd+F/H) and slash `/` menu and smart-edit — they run only when `sc.matchAction` returns null. (Resolve overlap: the registry now owns bold/italic/code/link; remove the old hardcoded Cmd+B/I in favor of the registry.)
2. **Shortcuts panel**: a `⌨` button in the top bar AND a "全部快捷键 <combo>" affordance in the format bar; clicking either mounts `window.MDShortcutsPanel(t, sc, onClose)` into the editor root (`appendChild`); on close call the returned element's `_destroy()` then remove it. The panel's default open combo is `Mod+/` (already in registry → runAction('shortcuts')).
3. **Yuque-style format bar**: an always-visible toolbar row under the top bar with buttons B / I / `</>` / ↗(link) | H / ≡(list) / ✓(task) / “(quote), each with a hover tooltip showing the live shortcut (`window.MD_fmtCombo(sc.comboFor(id))`), plus a right-aligned "全部快捷键 <combo>" button. Buttons call `runAction(id)`. (This is in addition to / can replace the existing slash affordances — keep slash `/` working in the textarea.)
4. **Collapsible file rail**: a « button collapses the 256px rail to a 46px strip (brand "Z" + » expand + ＋ new note); » expands. Persist to `localStorage['mdkit:rail']` ('1'/'0').
5. **Empty state**: when the tree has no files, show the centered "还没有笔记" panel with ＋新建笔记 / 导入 .md buttons (per the prototype) instead of a blank editor.
6. Load `../lib/shortcuts.js` in editor.html (after store.js, before editor.js). Keep all other libs.
Keep: export menu, recycle bin, drag-reorder, find/replace, clip, ☁ 备份 button, onChange sync, autosave, theme dots, math/mermaid enhance after preview.

## sidepanel
- Rebrand to "Zedown"/"Z". Match the V3 header: brand tile "Z" + "Zedown" + "速记" + two icon buttons — the first an "open in editor" SVG (keeps `MDStore.openEditor()` + `window.close()`), the second a collapse "✕" SVG (`window.close()`). Keep all existing features (剪藏整页, slash/smart-edit, autosave, toolbar, math/mermaid enhance, code-copy). Optionally accept the registry for B/I/code if trivial, but not required.

## reader (merge into reader-view.js)
- Rebrand brand tile to "Z".
- **Collapsible TOC**: a toggle that hides/shows the 232px TOC rail; persist to `localStorage['mdkit:toc']` ('1'/'0'); when collapsed, show a slim affordance to reopen. Keep scroll-spy, progress, A−/A+ (preserved across theme), theme dots, edit handoff, code-copy/anchors/mermaid enhance.

## Load order (editor.html)
`…store.js, shortcuts.js, [zip.js, export.js, html2md.js, sync.js], vendor/katex.min.js, vendor/mermaid.min.js, reader-view.js, ./editor.js` — shortcuts.js must load before editor.js.

## Quality bar
- No console errors; no remote calls; all prior features still work; `node --check` passes; CSP clean (no inline script/handlers).
