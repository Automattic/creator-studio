# Creators Studio — agent guide

Electron + React + TypeScript desktop chat app wrapping the Claude Agent SDK. The main process spawns the SDK, streams events to the renderer over a zod-validated IPC channel, and asks the user for permission whenever the SDK wants to invoke a tool not covered by the bundled allow list.

## Run & test

The user runs `npm start` (Vite watch mode) in a separate terminal. **Do not run build commands** — the watcher picks up your edits automatically. Main-process edits require a restart (type `rs` in the `npm start` terminal); preload/renderer edits HMR automatically.

- `npm start` — Electron + Vite HMR (user's responsibility)
- `npm test` — runs `test:unit` then `test:e2e`.
- `npm run test:unit` — Vitest over `tests/unit/` (pure functions, sub-second).
- `npm run test:unit:watch` — Vitest in watch mode.
- `npm run test:e2e` — Playwright over `tests/e2e/`. `tests/global-setup.ts` packages the app with `TEST_BUILD=1` on first run and caches it via `out/.test-build`; it re-packages if the binary is missing, the marker is missing, or the existing binary's `EnableNodeCliInspectArguments` fuse isn't enabled (i.e. somebody ran plain `npm run package` on top). Invalidate the marker whenever you touch `src/main/**` or `src/preload/**`.
- `npm run lint` / `lint:css` / `format` — WordPress-flavored ESLint, Stylelint, wp-prettier.

E2E specs that hit the agent need `ANTHROPIC_API_KEY` in `.env` or the shell. All e2e specs seed an isolated userData dir via `CREATOR_STUDIO_USER_DATA_DIR` + a linked tmp folder (see `tests/helpers/linked-folders.ts`) so runs don't touch the real app's state.

## Visual inspection via Playwright MCP

Unpackaged builds expose CDP on `localhost:9222` (`main.ts`, gated by `! app.isPackaged`); `.mcp.json` registers a Playwright MCP server against it. Agents drive the live dev window via `browser_click` / `browser_type` / `browser_take_screenshot` / `browser_run_code`.

Quirks:

- **Screenshots lose the backdrop.** The window uses transparent bg + macOS vibrancy; CDP captures web contents only, so transparent pixels come back white. Inject `html, body { background: ... }` before shooting, remove after.
- **Dark mode needs `page.emulateMedia({ colorScheme: 'dark' })`** via `browser_run_code` — `matchMedia` reflects Chromium's emulation, not the OS.
- **Reloads drop the session.** `Target ... has been closed` on the next call is expected; retry and the MCP re-attaches.
- **`browser_navigate` hijacks the app window.** Navigating to `localhost:9222` replaces the app with the CDP listing page; recover with `browser_navigate('http://localhost:5173')` (Vite dev URL).
- **Save screenshots under `.playwright-mcp/`** — `/tmp` is outside the MCP's allowed roots. Don't commit `page-*.png` / `app-*.png` (they land in the repo root).

## Layout

```
src/
  main/
    main.ts          Electron lifecycle, window, ipcMain handlers
    agentService.ts  Wraps SDK query(), per-folder sessions, permission gating
    folderService.ts Linked-folder persistence (userData/folders.json)
    chatService.ts   Per-chat jsonl log + chats.json metadata inside the folder
    permissions.ts   canUseTool helpers (in-folder path check, bash parsers)
    ipc.ts           Channel names + zod schemas for all IPC payloads
  preload/
    preload.ts       Exposes window.api via contextBridge
  renderer/
    App.tsx          Messages keyed by folderId, folder picker, composer
    components/
      Sidebar.tsx            Folders + Base UI dropdown for "Link folder"
      PermissionPrompt.tsx   Modal for canUseTool requests
      ToolBlock.tsx          Tool-use card; Bash gets a dedicated view
    lib/
      stripAnsi.ts   Strips ANSI escapes from tool output
    index.css        Single stylesheet (wp-stylelint)
resources/
  claude-defaults.json  Bundled allow/deny; shipped via extraResource
tests/
  global-setup.ts           Packages app with TEST_BUILD=1 (used by Playwright only)
  helpers/
    linked-folders.ts       mkdtemp userData + seed folders.json for e2e isolation
  unit/
    permissions.spec.ts     Pure-function tests for the canUseTool helpers
  e2e/
    shell.spec.ts           UI layout, composer gated on a linked folder
    folders.spec.ts         + dropdown, per-folder transcript switching
    agent.spec.ts           Real Claude round-trip
    bash.spec.ts            Pre-approved curl passes without a prompt
```

## Key decisions (and the reasons)

**Native SDK binary is a runtime dependency.** The Agent SDK exec's `@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude` at runtime, so `forge.config.ts` copies the whole package dir into `Contents/Resources` via `extraResource`. `resolveClaudeCodeBinary()` in `agentService.ts` checks `process.resourcesPath` first (packaged), then falls back to `node_modules` (dev). If you bump the SDK version, re-verify both paths resolve.

**`resources/claude-defaults.json` overrides the user's `~/.claude/settings.json`.** Passed to the SDK as `options.settings`. New allow/deny patterns belong here, not in personal config. The file ships as an `extraResource`; `resolveBundledSettingsPath()` does the same packaged-vs-dev split as the binary.

**Hardened fuses by default; `TEST_BUILD=1` is the only escape hatch.** Relaxes `EnableNodeCliInspectArguments` so Playwright's debugger can attach. Cookie encryption stays off because we don't yet have Developer ID signing — an unsigned build can't use the keychain anyway. Never set `TEST_BUILD` for distribution.

**Permission flow is request/response, with an in-session memory.** `canUseTool` generates a `requestId`, emits `permission-request`, and parks the promise in `pendingPermissions`. The renderer resolves it by calling `window.api.permission.respond(requestId, decision, remember)`. `remember: true` adds the tool name to `allowForSession`, skipping the round-trip on subsequent calls within the same SDK session.

**In-folder auto-allow (permissions.ts).** Before prompting, `canUseTool` short-circuits a few cases: `Read`/`Write`/`Edit`/`Glob`/`Grep`/`NotebookEdit` auto-allow when the path argument resolves inside the active folder; `Bash` auto-allows when the command parses as read-only (grep/find/ls/git status|log|…) or as a narrow safe-write (mkdir/touch/rm single-file/echo > inside folder). Everything else falls through to the prompt. The footgun guard for `.creator-studio/` lives in the bundled settings `deny` list — the SDK short-circuits those before `canUseTool` runs.

**Per-folder chats.** Each linked folder has its own SDK session id; `AgentService.sessionsByFolder` maps folderId → sessionId and is hydrated from `<folder>/.creator-studio/chats.json` on first send after a restart. Messages are appended to `<folder>/.creator-studio/chats/default.jsonl` at finalization points (user turn on send, assistant on each final assistant SDK message, tool on tool_result). The renderer loads the jsonl the first time a folder becomes active.

**Test isolation.** The main process honors `CREATOR_STUDIO_USER_DATA_DIR` and calls `app.setPath('userData', ...)` when set; e2e specs use this + a seeded folders.json (see `tests/helpers/linked-folders.ts`) so tests never touch the real userData.


## IPC protocol

Channels (`IpcChannels` in `src/main/ipc.ts`):

- `chat:send` — renderer → main. `{ prompt: string }`. Returns when the SDK run completes.
- `chat:event` — main → renderer. `AgentEvent` discriminated union: `init | text-delta | tool-use-start | tool-result | permission-request | result | done | error`.
- `permission:respond` — renderer → main. `{ requestId, decision: 'allow'|'deny', remember: boolean }`.

Message lifecycle: `init` → zero or more `text-delta` / `tool-use-start` / `tool-result` / `permission-request` → `result` → `done`. `error` may arrive at any point; `done` still follows.

## Test IDs

Renderer elements carry `data-testid` for Playwright. Keep these stable — E2E specs depend on them.

- Shell: `titlebar`, `transcript`, `composer`, `chat-input`, `send-button`
- Sidebar: `sidebar`, `sidebar-top`, `sidebar-add`, `sidebar-toggle`, `sidebar-folders`, `sidebar-folders-empty`, `sidebar-folder-<id>` (has `data-active="true"` on the selected one)
- `+` menu: `sidebar-add-menu`, `sidebar-add-menu-link-folder`
- Messages: `bubble-user`, `bubble-assistant` (has `data-streaming="true|false"`)
- Tools: `tool-block-bash` (Bash-only), `tool-block` (everything else); both carry `data-status="running|done|error"`
- Permissions: `permission-prompt`, `permission-deny`, `permission-allow-once`, `permission-allow-session`

## Code style

- WordPress ESLint (`@wordpress/eslint-plugin/recommended`) + wp-prettier + `@wordpress/stylelint-config`. Tabs, single quotes, space-in-parens, trailing comma rules from wp-prettier.
- Node 22 (`.nvmrc`, `engines` pin). Use `nvm use` before installing.
- TypeScript strict mode; no `any` without a narrow reason.
- Zod for every IPC boundary.
- Comments only when the *why* isn't obvious from the code (a hidden constraint, a workaround, a surprising choice). Don't narrate what the code does.

## Commit & PR style

- Lowercase, short subject line; body explains the *why* in 1–2 sentences.
- Create new commits instead of amending; rely on pre-commit hooks (don't pass `--no-verify`).

### Screenshots on PR descriptions

Never commit screenshots to the PR branch. Host them on the long-lived orphan `pr-screenshots` branch under `pr-<N>/<image>.png` and reference them from the PR body via `https://raw.githubusercontent.com/Automattic/creator-studio/pr-screenshots/pr-<N>/<image>.png`. The branch's own README documents the worktree-based workflow (`git worktree add /tmp/pr-screenshots origin/pr-screenshots`). Rationale: keeps `trunk` history binary-free; the assets branch never merges.

## Verify & Quality
For any task make sure the agents have a way to verify its success and things working.
Do things step by step when possible and verify each step.
If you found something unexpected or that you feel requires some hack let the human know about the unexpected situation and why an "hack" was needed.
