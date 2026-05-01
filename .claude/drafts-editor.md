# Drafts editor — handoff for future Claude sessions

This file is a working handoff. The drafts editor was built across PR #46 (`drafts-editor` branch). If you're picking it up: read this end-to-end before changing anything in `src/renderer/screens/DraftEditorScreen.tsx`, `src/renderer/editor/`, or the `drafts:*` IPC channels.

## Goal in one sentence

Click a draft row in the Drafts View → open a focused, Obsidian/Zettlr-style markdown editor with cursor-adaptive live decorations and silent auto-save. The editor is the writing surface; the agent (Cmd+J menu) is layered on top in a future PR.

## Architecture pin

**Plain CodeMirror 6 + custom decoration plugins.** Not ink-mde, not MDXEditor, not Tiptap. This was reconsidered four times and the answer kept coming back to custom because:

- The product is "Obsidian-style live preview" (markdown source is the doc model; marks fade as cursor leaves the line). MDXEditor / Milkdown / Tiptap are ProseMirror/Lexical-based — different paradigm (formatted nodes, not source).
- ink-mde covers ~60% but its theming would fight our CSS variables and its plugin API is "experimental." Loses the polish that *defines* a writer's editor.
- ixora is stale (2022 last release) and most of its value is duplicated by `@codemirror/lang-markdown`'s `defaultHighlightStyle`.

The custom delta is ~600 LOC of editor code we own outright. **Don't migrate without a strong reason** — those LOC are the experience-defining bits. See the audit in `tier 1` section below for what's polished and what's still open.

## File map

```
src/main/channels/
├── drafts-list-all.ts          aggregate drafts across projects (preexisting)
├── drafts-read.ts              {title, body, frontmatter, mtime} for editing
├── drafts-write.ts             frontmatter assembly via gray-matter; mtime guard
├── drafts-save-image.ts        content-addressed image upload (sha256[0..12])
└── shell-open-external.ts      Cmd+Click on link → http(s) only

src/main/main.ts                registers `studio-asset://` privileged scheme

src/renderer/screens/
└── DraftEditorScreen.tsx       the screen + EditorView setup (single file, ~600 LOC)

src/renderer/editor/
├── markdown-live-decorations.ts  hide-marks, bullet glyph, heading line classes,
│                                 blockquote bar, HR widget, fenced-code lines
├── markdown-task-widget.ts        TaskMarker → <input type=checkbox>
├── markdown-image-widget.ts       Image → <img> via studio-asset://
├── markdown-keymap.ts             Cmd+B/I/K wrap, Tab list-aware, Cmd+Shift+1..6/L,
│                                  smartSelectionWrap (*/_/~), pasteUrlAsLink
├── markdown-link-click.ts         Cmd+Click → window.api.shell.openExternal
├── draft-cursor-memory.ts         localStorage-backed cursor + scroll memo
└── AiMenu.tsx                     placeholder UI; Cmd+J cursor-anchored popup

src/renderer/hooks/
└── useAutoSave.ts                debounced (1s) + flush on blur/unmount

src/renderer/index.css           heading sizes, blockquote, fenced code, image
                                  widget, AI menu — all under .draft-editor-host

tests/unit/drafts-write.spec.ts   path-escape, mtime conflict, frontmatter roundtrip
tests/e2e/draft-editor.spec.ts    core flow (5 specs)
tests/e2e/draft-editor-extras.spec.ts  Phase A/B/C (5 specs)
```

## What works today (ship list)

**Doc model & I/O**
- Drafts live as `<project>/drafts/<relPath>.md`. Frontmatter via `gray-matter`.
- `drafts:read` returns `{title, body, frontmatter, mtime}`. 25 MB cap.
- `drafts:write` uses `matter.stringify(body, { ...frontmatter, title })` — non-title YAML keys round-trip. mtime conflict guard refuses to clobber.
- `drafts:saveImage` content-addresses uploads under `<project>/drafts/assets/<sha256[0..12]>.<ext>`. Mime allow-list (png/jpeg/gif/webp/svg). 25 MB cap. Dedup-on-existing-hash.
- Auto-save: 1 s debounce, flush on `window blur`, unmount, Back, Esc.

**Live decorations** (cursor-adaptive — visible when cursor is on the line, hidden otherwise)
- Heading marks (`#`..`######`), with trailing-space swallow
- Emphasis marks (`*`, `_`, `**`, `~~`)
- Link brackets and `(url)`
- Inline code marks
- Quote marks (`>`) with trailing-space swallow + line-level `cm-blockquote-line` class for left bar + indent + italic
- Bullet marks (`-`/`*`/`+`) → `•` glyph (numbered list digits stay visible)
- Heading line classes (`cm-h1`..`cm-h6`) for size/weight via CSS

**Block widgets**
- `Image` → `<img>` via `studio-asset://<projectId>/<urlencoded relPath>` protocol (registered in `main.ts` as a privileged scheme; rejects file:// and OS-absolute paths)
- `TaskMarker` (`[ ]`/`[x]`) → real `<input type="checkbox">`. Click toggles state via single-char doc change.
- `HorizontalRule` (`---`/`***`/`___`) → `<hr>` widget; cursor on line falls back to raw markdown.
- `FencedCode` blocks → every line tagged `cm-fenced-line`; CSS gives subtle bg + monospace + rounded first/last corners.

**Keymap**
- Cmd+B / I / K — wrap selection (or insert markers) with `**` / `*` / `[…](…)` (formatting bindings in `markdown-keymap.ts`)
- Cmd+J — open AI menu placeholder
- Cmd+Shift+1..6 — toggle heading level
- Cmd+Shift+L — toggle list status
- Cmd+Alt+G — gotoLine dialog
- Cmd+F — search panel; Cmd+G / Shift+Cmd+G next/prev; Cmd+Alt+F replace; Cmd+D select-next-occurrence
- Cmd+Click on `[text](url)` or `<autolink>` → `shell:openExternal` (validates http/https only)
- Tab in list item → indent (uses `indentMore`); on prose line → literal `\t`. Shift+Tab is the inverse.
- Esc — close AI menu / back to drafts (with auto-save flush)
- Enter on list item → `insertNewlineContinueMarkup` from `markdownKeymap` (auto-continues the marker; ends list on empty item)
- Backspace on heading start → `deleteMarkupBackward` strips the marker
- Auto-close `(`/`[`/`{`/`"`/`'`/`` ` ``; smart skip-over close char; Backspace deletes pair
- Smart selection wrap: select text + type `*` / `_` / `~` → wraps the selection
- Paste URL on selection → `[selectedText](url)`
- **Free from `defaultKeymap`**: Alt+↑/↓ move line, Shift+Alt+↑/↓ duplicate, Cmd+Shift+K delete line, Cmd+]/[ indent/outdent, Cmd+/ toggle comment, Cmd+Alt+↑/↓ multi-cursor (logical only — no `drawSelection` so the visual indicator is gone), Shift+Cmd+\ jump to bracket, Ctrl+L select line, etc.

**Shell**
- Title input (separate from body) — round-trips through frontmatter
- Save status pill (`idle` / `dirty` / `saving` / `saved` / `error`)
- Word-count chip — `<n> words · ~<m> min` document mode; `<n> selected · <c> chars` selection mode (full breakdown in `title` tooltip)
- Back button (← Drafts) — flush before leaving
- Cursor + scroll position remembered per `(projectId, relPath)` via `localStorage` (key `draftCursor:…`)
- Auto-focus on mount; restore saved cursor or fall back to end-of-doc

**Typography**
- Charter / Georgia serif at 17 px / 1.7 line-height, 760 px column
- Heading padding balanced (`0.5em` top / `0.4em` bottom on h1; sized down per level)
- Native macOS selection color (we deliberately do NOT use `drawSelection()` — see "Gotchas")
- Dark mode parity via existing `--fg` / `--workspace-bg` / `--hairline` tokens

## Open work

### Tier 2 — real features, each its own PR
- **Outline / TOC panel** (sidebar of headings with click-to-jump)
- **Typewriter mode + focus mode** — center active line, dim other paragraphs
- **Per-language code-fence highlighting** — `@codemirror/language-data` lazy registry
- **Math (KaTeX) blocks** — `$x$` and `$$x$$` widgets
- **Footnote rendering** — `[^1]` markers + tooltip + gutter
- **Mermaid diagrams** — fenced `mermaid` blocks
- **Pretty table editing** — pipe-aligned grid + Tab/Shift+Tab cell nav

### Tier 3 — lower priority for the paradigm
- Wikilinks (`[[doc-title]]` cross-doc index — needs vault model)
- Citations / bibliography (academic — out of paradigm)
- Adjustable font / line-height (settings UI prerequisite)
- Print / export pipeline
- LanguageTool grammar (server dep)
- Multiple typographic themes
- Custom autocorrect rules (settings UI prerequisite)

### Out of paradigm — explicitly not chasing
Vim/Emacs modes; Pomodoro; multi-user OT collaboration; smart typography (`--`, `...`, smart quotes — macOS handles these via system-wide text substitution).

### Conflict resolution UX
`drafts:write` returns `mtime-conflict` when the on-disk file changed under us. The save status pill goes to `error` ("Save failed"). There's no merge/overwrite prompt yet — adding one is its own PR.

### AI menu
`AiMenu.tsx` is a non-functional placeholder. Cmd+J opens a cursor-anchored popup with a disabled input + 5 disabled actions (Check grammar, Rewrite sharper, Expand idea, Brainstorm, Continue writing). Each action button has a TODO comment pointing to the follow-up PR. Wiring needs:
- An IPC channel that streams agent SDK responses for an "edit selection" turn
- A way to insert / replace selection from streamed text
- Progress / cancel UI inside the menu

## Patterns — how to extend

### Adding a new live decoration
1. In `markdown-live-decorations.ts`, add a case inside `buildDecorations`'s `enter` callback for the new lezer node name.
2. Use `Decoration.line({ attributes: { class: '...' } })` for line-level styling, or `Decoration.replace({ widget: new XxxWidget() })` to swap content.
3. Always check `lineActive` before hiding marks — cursor on the line should reveal the source.
4. Two-pass sort is required (line decos first at same position) — see existing code, follow the pattern.
5. Add the CSS to `.draft-editor-host .cm-…` blocks in `index.css`.

### Adding a keybinding
Two paths:
- **Cross-cutting** (works regardless of cursor context): add to `markdownFormattingBindings` / `markdownBlockBindings` / `markdownTabBindings` in `markdown-keymap.ts`.
- **Inline in the editor's keymap.of(...)**: only for things that need to capture refs from `DraftEditorScreen` (e.g. AI menu open, Esc-to-back). Place earlier in the array than `defaultKeymap` to win precedence.

### Adding an IPC channel
Pattern (every existing channel follows it — see `drafts-read.ts` as the cleanest example):
1. Create `src/main/channels/<name>.ts` exporting `defineChannel({ name, input, handle })`.
2. Add `<key>: '<wire-name>'` to `IpcChannels` in `src/main/channels/index.ts`.
3. Import + register in `src/main/ipc.ts`'s `channels` array.
4. Expose typed wrapper in `src/preload/preload.ts` under `window.api.<group>.<method>`.
5. Use `getProject(projectId)` + `resolveInside(...)` for any path-based operation.

### Adding a new editor file
Convention: prefix `markdown-` for editor extensions; place in `src/renderer/editor/`. Export at top-level. Import + add to the `extensions:` array in `DraftEditorScreen.tsx`.

## Gotchas / lessons learned (don't repeat these)

1. **CSS `margin` on `.cm-line` breaks click hit-testing.** CodeMirror measures lines via `getBoundingClientRect` which excludes margins. Asymmetric heading margins caused cursor clicks to land on the wrong line. **Use `padding-top/bottom` instead.**

2. **Zod v4 requires explicit key+value for `z.record()`.** `z.record(z.unknown())` errors at runtime in v4 with "Cannot read properties of undefined (reading '_zod')". Use `z.record(z.string(), z.unknown())`.

3. **GFM is not the default in `markdown()`.** `[ ]` parses as link brackets without it, and our `LinkMark` hide rule eats them. Use `markdown({ base: markdownLanguage })` (`markdownLanguage` is the GFM-flavored variant exported by `@codemirror/lang-markdown`).

4. **`defaultKeymap` does not include `Tab`.** Intentional — accessibility (focus trap). We bind it explicitly: `tabIndentInList` first (returns `false` on non-list lines), then `insertTab` as fallback.

5. **`markdownKeymap` is auto-added by `markdown()` at `Prec.high`.** You don't need to spread it again — but doing so is harmless. The Enter-to-continue and Backspace-to-delete-markup come from there.

6. **`drawSelection()` overrides the native macOS selection color.** Without it, native browser selection inherits the OS accent (System Settings → Appearance). We removed `drawSelection()` and the matching CSS override — small price is no visual indicator for multi-cursor (logical multi-cursor still works for editing).

7. **Drop position ≠ cursor position.** `dropCursor()` shows where the dropped image will go visually, but doesn't move the editor selection. Use `view.posAtCoords({ x: e.clientX, y: e.clientY })` synchronously inside the drop handler before any `await`. Clamp with `Math.min(atPos, doc.length)` for safety after the IPC roundtrip.

8. **`defaultHighlightStyle` uses scoped class IDs (e.g. `ͼ7`) for headings.** You can't target `.cm-header-1` from CSS. Apply your own line classes (`cm-h1`..`cm-h6`) via `Decoration.line` in the live-decorations plugin.

9. **`markdownTaskWidget` checkbox needs `ignoreEvent(): true`.** Otherwise CodeMirror translates the click into a cursor move that re-shows the raw `[ ]` text and the click misses the checkbox.

10. **Custom protocol must be `registerSchemesAsPrivileged` BEFORE `app.whenReady`.** The actual handler (`protocol.handle`) goes inside `app.whenReady`. Easy to invert; the result is `<img>` tags don't load.

11. **`em` units on heading padding compound with the heading's own `font-size`.** `padding-top: 0.6em` on an `h2` (1.5em font-size) is 0.9em real. Either accept the multiplication or use `rem`.

12. **`@codemirror/search` panel handles its own Esc internally.** Our Esc-to-back binding doesn't fire when the search input has focus — focus is in the panel, our editor keymap is out of play. If you add autocomplete or another panel later, gate the Esc binding on "no panel open" to be safe.

## Testing & verification

- **Unit**: `npm run test:unit` — 114 specs, vitest. New write-channel tests live in `tests/unit/drafts-write.spec.ts`. Mock electron via `vi.mock('electron', …)`.
- **E2E**: `npm run test:e2e` — Playwright. 10 editor-related specs (`draft-editor.spec.ts` + `draft-editor-extras.spec.ts`). Each spec packages the app first; the suite takes ~25 s.
- **Manual**: Playwright MCP + dev server. Always `npm run ensure-dev` first; for main-process changes `npm run reload`. CDP target reattaches automatically; if `Target ... has been closed`, retry.
- **Lint**: `npm run lint` (ESLint, WordPress flavor) and `npm run lint:css` (stylelint). Pre-commit hook runs both. wp-prettier is opinionated about wrapping — let `npx prettier --write` fix on failure.

## Branch & PR

- **Branch**: `drafts-editor` (off `trunk`).
- **PR**: #46 on Automattic/studio-write.
- All commits use lowercase short subjects with explanatory bodies. No `Co-Authored-By` or "Claude Code" references (per global CLAUDE.md).
- Test draft used during MCP verification: `<radical-speed-month-project>/drafts/sample-editor-test.md`. Restore it from clean state if you've been editing it during tests.

## Sequence of major commits (for archeology)

```
86496c7  drafts view: enable nav, render placeholder screen   (preexisting)
…
6fcae8d  empty draft-editor screen routed from clickable rows
bf17bf5  drafts:read IPC and raw body display
6139fdc  mount CodeMirror with markdown lang
a9ecb94  editable title input
30c21e9  drafts:write IPC + debounced auto-save
e80da30  cursor-adaptive live decorations
bba9a77  typography for the writing surface
4c9ecc9  image rendering ViewPlugin via studio-asset://
250bf8f  drafts:saveImage IPC + paste/drop handlers
096bd8d  writer polish (spell-check, word count, keymaps, esc, focus)
c786cc7  AI slash-menu placeholder
50ebb0e  unit tests for drafts:write
8360ada  e2e tests
5ba7702  fix click hit-testing on heading lines  (margin → padding)
868009a  GFM lists, task checkboxes, bullet glyphs, enter-to-continue
7e25a72  bind Tab to insert tab, Shift+Tab to outdent
b919b12  list-aware Tab/Shift+Tab nests and outdents
39bb904  enable stock CM6 extensions  (Phase A: closeBrackets, search, …)
f763be4  smart wrap + paste-URL + heading/list toggles + selection wc  (Phase B)
738852d  Cmd+Click on link opens external                              (Phase C)
8985202  e2e tests for extras                                           (Phase D)
47749f4  drop image at the drop position, not the cursor
1e2986d  native macOS selection color
7e3575b  balance heading line padding
57f4704  blockquote left bar + indent      (Tier 1.1)
56c1d75  HR widget + fenced code background (Tier 1.2/1.3)
bfb1aed  remember cursor and scroll per draft (Tier 1.4)
9e36e24  goto-line dialog (Cmd+Alt+G)         (Tier 1.5)
46533ae  extended statistics in header chip   (Tier 1.6)
```

## Quick orientation when you land

1. Read `src/renderer/screens/DraftEditorScreen.tsx` end-to-end — it composes everything.
2. Read `src/renderer/editor/markdown-live-decorations.ts` — the heart of the visual experience.
3. Read this file's "Gotchas" section before debugging anything weird.
4. Run `npm run ensure-dev`, open a draft, make sure the basics work before touching code.
