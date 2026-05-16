# Studio Write — agent guide

Electron + React + TypeScript desktop chat app wrapping the Claude Agent SDK. The main process spawns the SDK, streams events to the renderer over a zod-validated IPC channel, and asks the user for permission whenever the SDK wants to invoke a tool not covered by the bundled allow list.

## Run & test

The user normally runs `npm start` in a separate terminal. `npm start` wraps `electron-forge start` via `scripts/dev.mjs` and exposes a reload socket (under `os.tmpdir()`, keyed by a hash of the project root so parallel worktrees don't collide) so agents can restart the main process without the user typing `rs`. Preload/renderer edits HMR automatically; for main-process or `resources/` edits, run `npm run reload` — it blocks until a fresh `bootId` lands in `.vite/dev-boot.json`, and the marker is only written after the renderer finishes loading, so exit 0 means the app is back up _and_ the Playwright MCP CDP target is attachable (no mid-reload reattach races). The socket lives outside `.vite/` because electron-forge's vite plugin wipes that dir on startup, which would unlink a socket file placed there.

Before any Playwright MCP call or `npm run reload`, run `npm run ensure-dev`. It's idempotent: if the dev server is already up it exits immediately; if not, it opens a visible Terminal.app window running `npm start` (so the user can watch forge/Vite output), or on non-macOS falls back to a detached process logging to `.vite/dev.log`. Either way it blocks until the new boot marker lands. Prefer this over asking the user to start npm themselves.

-   `npm start` — Electron + Vite HMR via `scripts/dev.mjs` (user's responsibility)
-   `npm run ensure-dev` — start `npm start` detached if it isn't already running; blocks until CDP is live
-   `npm run reload` — restart the Electron main process; blocks until the new process is live
-   `npm test` — runs `test:unit` then `test:e2e`.
-   `npm run test:unit` — Vitest over `tests/unit/` (pure functions, sub-second).
-   `npm run test:unit:watch` — Vitest in watch mode.
-   `npm run test:e2e` — Playwright over `tests/e2e/`. `tests/global-setup.ts` unconditionally runs `TEST_BUILD=1 npm run package` before the suite. Packaging takes ~5s; we don't cache it — a prior marker/fuse-check scheme kept reusing stale builds and caused flaky failures that only cleared after `rm -rf out`.
-   `npm run lint` / `lint:css` / `format` — WordPress-flavored ESLint, Stylelint, wp-prettier.

E2E specs that hit the agent need `ANTHROPIC_API_KEY` in `.env` or the shell. All e2e specs seed an isolated userData dir via `STUDIO_WRITE_USER_DATA_DIR` + a linked tmp folder (see `tests/helpers/linked-projects.ts`) so runs don't touch the real app's state.

## Visual inspection via Playwright MCP

Unpackaged builds expose CDP on a per-worktree port derived from the project root (`main.ts`, gated by `! app.isPackaged`). `.mcp.json` runs `scripts/playwright-mcp.mjs`, which recomputes the same port from `process.cwd()` and spawns `@playwright/mcp` against it, so parallel worktrees don't cross-wire. The Vite renderer port is hashed the same way (`vite.renderer.config.ts`) with `strictPort: true`, so each worktree has a stable renderer URL that can't drift when sibling worktrees boot in different orders. Both values are written into `.vite/dev-boot.json` (`cdpPort`, `rendererUrl`) — read that if you need to point DevTools or a browser at the live app yourself. Agents drive the live dev window via `browser_click` / `browser_type` / `browser_take_screenshot` / `browser_run_code`.

Quirks:

-   **Screenshots lose the backdrop.** The window uses transparent bg + macOS vibrancy; CDP captures web contents only, so transparent pixels come back white. Inject `html, body { background: ... }` before shooting, remove after.
-   **Dark mode needs `page.emulateMedia({ colorScheme: 'dark' })`** via `browser_run_code` — `matchMedia` reflects Chromium's emulation, not the OS.
-   **Reloads drop the session.** `Target ... has been closed` on the next call is expected; retry and the MCP re-attaches.
-   **`browser_navigate` hijacks the app window.** Navigating to the CDP port replaces the app with the CDP listing page; recover with `browser_navigate(<rendererUrl from .vite/dev-boot.json>)`. The Vite renderer port is per-worktree — don't hardcode 5173.
-   **Save screenshots under `.playwright-mcp/`** — `/tmp` is outside the MCP's allowed roots. Don't commit `page-*.png` / `app-*.png` (they land in the repo root).

### Fast verification via `window.__sw`

Every MCP tool call is a ~1–2s round-trip, so blind `browser_snapshot` + `browser_wait_for(time)` between steps is expensive. Use the dev-only `window.__sw` surface (installed by `App.tsx` when the renderer runs from `http://localhost`):

-   `__sw.isStreaming()` — any assistant bubble has `data-streaming="true"`.
-   `__sw.hasPendingPermission()` — `[data-testid=permission-prompt]` is on screen.
-   `__sw.isIdle()` — neither of the above.

Two rules for agent-driven verification:

-   **UI nav** (project switch, sidebar toggle, opening a menu, typing into the composer): no wait. Click/fill, then read one field via `browser_evaluate` if you need to confirm — don't snapshot.
-   **Chat send**: click Send, then one `browser_run_code`:
    ```js
    await page.waitForFunction( () => window.__sw.isIdle(), null, {
    	timeout: 120_000,
    	polling: 200,
    } );
    ```
    Polling happens inside the page; the call returns the instant the stream finishes. This is the only long wait you ever need.

Prefer `browser_run_code` over multiple sequential tool calls for multi-step flows — one round-trip instead of five.

## Layout

```
src/
  main/
    main.ts          Electron lifecycle, window, ipcMain handlers
    ipc.ts           IpcChannels constant + registerIpcHandlers()
    channels/        One file per renderer ↔ main channel (defineChannel/defineEvent)
    services/        One file per action (project-create, chats-list, …) + utilities/ (stores, permissions, prompts, resource-paths)
  preload/
    preload.ts       Exposes window.api via contextBridge
  renderer/
    App.tsx          Messages keyed by projectId, project picker, composer
    components/
      Sidebar.tsx            Projects + Base UI dropdown for "Link project"
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
    linked-projects.ts      mkdtemp userData + seed projects.json for e2e isolation
  unit/
    permissions.spec.ts     Pure-function tests for the canUseTool helpers
  e2e/
    shell.spec.ts           UI layout, composer gated on a linked project
    projects.spec.ts        + dropdown, per-project transcript switching
    agent.spec.ts           Real Claude round-trip
    bash.spec.ts            Pre-approved curl passes without a prompt
```

## Key decisions (and the reasons)

**Native SDK binary is a runtime dependency.** The Agent SDK exec's `@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude` at runtime, so `forge.config.ts` copies the whole package dir into `Contents/Resources` via `extraResource`. `resolveClaudeCodeBinary()` in `services/utilities/resource-paths.ts` checks `process.resourcesPath` first (packaged), then falls back to `node_modules` (dev). If you bump the SDK version, re-verify both paths resolve.

**`resources/claude-defaults.json` overrides the user's `~/.claude/settings.json`.** Passed to the SDK as `options.settings`. New allow/deny patterns belong here, not in personal config. The file ships as an `extraResource`; `resolveBundledSettingsPath()` does the same packaged-vs-dev split as the binary.

**Hardened fuses by default; `TEST_BUILD=1` is the only escape hatch.** Relaxes `EnableNodeCliInspectArguments` so Playwright's debugger can attach. Cookie encryption stays off because we don't yet have Developer ID signing — an unsigned build can't use the keychain anyway. Never set `TEST_BUILD` for distribution.

**Permission flow is request/response, with an in-session memory.** `canUseTool` generates a `requestId`, emits `permission-request`, and parks the promise in `pendingPermissions`. The renderer resolves it by calling `window.api.permission.respond(requestId, decision, remember)`. `remember: true` adds the tool name to `allowForSession`, skipping the round-trip on subsequent calls within the same SDK session.

**In-project auto-allow (services/utilities/permissions.ts).** Before prompting, `canUseTool` short-circuits a few cases: `Read`/`Write`/`Edit`/`Glob`/`Grep`/`NotebookEdit` auto-allow when the path argument resolves inside the active project; `Bash` auto-allows when the command parses as read-only (grep/find/ls/git status|log|…) or as a narrow safe-write (mkdir/touch/rm single-file/echo > inside project). Everything else falls through to the prompt. The footgun guard for `.studio-write/` lives in the bundled settings `deny` list — the SDK short-circuits those before `canUseTool` runs.

**Per-project chats.** Each linked project has its own SDK session id; `AgentService.sessionsByChat` maps chatId → sessionId and is hydrated from `<project>/.studio-write/chats.json` on first send after a restart. Messages are appended to `<project>/.studio-write/chats/default.jsonl` at finalization points (user turn on send, assistant on each final assistant SDK message, tool on tool_result). The renderer loads the jsonl the first time a project becomes active.

**Single source of truth for chat state.** `App.tsx` owns every per-chat slot the UI consumes — `messagesByChat`, `busyChats`, `permissions`, `streamsByChatRef`, `activeChatIdByProject`, `chatsByProject` — keyed by `chatKey(projectId, chatId)`. Both `ProjectScreen` and `DraftSidebar` are presentational: they receive the active chat's messages / busy / permissions and the create/select/delete/send/cancel callbacks via props. There is one `agent:onEvent` listener (in `App.tsx`); `DraftChatPanel` no longer subscribes. `activeChatIdByProject` is shared, so switching views keeps the same chat selected and any in-flight stream continues to update both.

**Test isolation.** The main process honors `STUDIO_WRITE_USER_DATA_DIR` and calls `app.setPath('userData', ...)` when set; e2e specs use this + a seeded projects.json (see `tests/helpers/linked-projects.ts`) so tests never touch the real userData.

## IPC protocol

Channels (`IpcChannels` in `src/main/ipc.ts`):

-   `agent:send` — renderer → main. `{ prompt: string, projectId, chatId? }`. Returns when the SDK run completes.
-   `agent:onEvent` — main → renderer. `AgentEvent` discriminated union: `init | text-delta | tool-use-start | tool-result | permission-request | result | done | error`.
-   `agent:respondPermission` — renderer → main. `{ requestId, projectId, decision: 'allow'|'deny', remember: boolean }`.
-   `prompt:get` — renderer → main. `{ name: PromptName, projectId }`. Returns the bundled prompt with `{{project}}` substituted.
-   `chat:create` / `chat:load` — chat record CRUD (single record). Chats are project-scoped only; the draft editor sidebar shares the same list as the project view.
-   `chats:list` / `chats:recent` — chat record listings (per project / cross-project).
-   `project:create` / `project:remove` / `project:pickPath` / `projects:list` — workspace record CRUD + picker.
-   `ui-prefs:get` / `ui-prefs:set` — global UI preferences persisted to `<userData>/ui-prefs.json` (e.g. `resourcesPanelOpen`). Window-level state, not per-project.

Message lifecycle: `init` → zero or more `text-delta` / `tool-use-start` / `tool-result` / `permission-request` → `result` → `done`. `error` may arrive at any point; `done` still follows.

## Test IDs

Renderer elements carry `data-testid` for Playwright. Keep these stable — E2E specs depend on them.

-   Shell: `titlebar`, `transcript`, `composer`, `chat-input`, `send-button`, `resources-toggle`
-   Sidebar: `sidebar`, `sidebar-top`, `sidebar-add` (Import; opens link-project modal), `sidebar-search`, `sidebar-toggle`, `sidebar-recent`, `sidebar-recent-empty`, `sidebar-recent-<chatId>` (has `data-active="true"` on the selected one)
-   Messages: `bubble-user`, `bubble-assistant` (has `data-streaming="true|false"`)
-   Tools: `tool-block-bash` (Bash-only), `tool-block` (everything else); both carry `data-status="running|done|error"`
-   Permissions: `permission-prompt`, `permission-deny`, `permission-allow-once`, `permission-allow-session`
-   Draft editor sidebar: `draft-sidebar`, `draft-sidebar-panel`, `draft-sidebar-body` (`data-tab="chat|checks|outline|same-project|share"`), `draft-sidebar-close`, `draft-sidebar-tab-chat`, `draft-sidebar-tab-checks`, `draft-sidebar-tab-outline`, `draft-sidebar-tab-same-project`, `draft-sidebar-tab-share`, `draft-chat-panel`, `draft-chat-composer`, `draft-chat-input`, `draft-chat-send`, `draft-checks-panel`, `draft-outline-panel`, `draft-same-panel`, `draft-same-row` (one per draft, `data-current="true"` on the active row), `draft-same-open-canvas`, `draft-share-panel`
-   Draft checks panel: `draft-checks-panel`, `draft-checks-panel-header`, `draft-checks-run`, `draft-checks-summary` (`data-running="true|false"`), `draft-checks-summary-apply-all`, `draft-checks-summary-dismiss-all`, `draft-checks-results` (`data-running="true|false"`), `draft-checks-error-<kind>`, `draft-checks-group-apply-all-<kind>` (only present when a group has ≥ 2 issues), `draft-checks-result-<id>` (`data-active="true|false"`), `draft-checks-result-apply-<id>`, `draft-checks-result-dismiss-<id>`
-   Draft editor chat header: `draft-chat-add` (new project chat), `draft-chat-history` (toggle popover), `draft-chat-history-popover`, `draft-chat-history-search`, `draft-chat-history-empty`, `draft-chat-history-item-<chatId>` (select; parent `.chat-history-item` carries `data-active="true"` on the selected one), `draft-chat-history-item-delete-<chatId>`. The project-level chat header uses the same scheme with `chat-history` as the prefix.
-   Draft editor share actions: `draft-share-action-mark-done` (top CTA, `data-state="idle|pending|error"`), `draft-share-mark-done-error` (error message, only present when the move failed), `draft-share-action-copy-md`, `draft-share-action-copy-html`, `draft-share-action-save-md` — copy/save rows carry `data-status="idle|success|error"`
-   Draft editor actions: `draft-editor-more-button`, `draft-editor-more-menu`, `draft-editor-action-rename`, `draft-editor-action-delete`
-   Rename dialog: `rename-draft-dialog`, `rename-draft-input`, `rename-draft-helper` (`data-state="idle|preview|error"`), `rename-draft-confirm`, `rename-draft-cancel`
-   WordPress (Settings): `settings-wordpress-section`, `settings-wordpress-add`, `settings-wordpress-empty`, `settings-wordpress-list`, `settings-wordpress-connection-<id>`, `settings-wordpress-disconnect-<id>`
-   WordPress connect dialog: `wordpress-connect-dialog`, `wordpress-connect-mode-self-hosted`, `wordpress-connect-mode-wpcom`, `wordpress-connect-site-url`, `wordpress-connect-username`, `wordpress-connect-app-password`, `wordpress-connect-wpcom-section`, `wordpress-connect-submit`, `wordpress-connect-cancel`, `wordpress-connect-error`
-   WordPress (Create-project modal): `project-mode-wordpress`, `project-wordpress-empty`, `project-wordpress-connection-<id>`, `project-wordpress-add-connection`, `project-wordpress-import-progress`
-   WordPress (share panel): `draft-share-action-publish-wp` (`data-state="idle|pending|success|error"`), `draft-share-publish-wp-menu` (multi-connection picker), `draft-share-publish-wp-target-<connectionId>`, `draft-share-publish-wp-success`, `draft-share-publish-wp-success-link`, `draft-share-publish-wp-error`

## Code style

-   WordPress ESLint (`@wordpress/eslint-plugin/recommended`) + wp-prettier + `@wordpress/stylelint-config`. Tabs, single quotes, space-in-parens, trailing comma rules from wp-prettier.
-   Node 22 (`.nvmrc`, `engines` pin). Use `nvm use` before installing.
-   TypeScript strict mode; no `any` without a narrow reason.
-   Zod for every IPC boundary.
-   Comments only when the _why_ isn't obvious from the code (a hidden constraint, a workaround, a surprising choice). Don't narrate what the code does.

## Commit & PR style

-   Lowercase, short subject line; body explains the _why_ in 1–2 sentences.
-   Create new commits instead of amending; rely on pre-commit hooks (don't pass `--no-verify`).

### Screenshots on PR descriptions

Never commit screenshots to the PR branch. Host them on the long-lived orphan `pr-screenshots` branch under `pr-<N>/<image>.png` and reference them from the PR body via `https://raw.githubusercontent.com/Automattic/studio-write/pr-screenshots/pr-<N>/<image>.png`. The branch's own README documents the worktree-based workflow (`git worktree add /tmp/pr-screenshots origin/pr-screenshots`). Rationale: keeps `trunk` history binary-free; the assets branch never merges.

## Verify & Quality

For any task make sure the agents have a way to verify its success and things working.
Do things step by step when possible and verify each step.
If you found something unexpected or that you feel requires some hack let the human know about the unexpected situation and why an "hack" was needed.
