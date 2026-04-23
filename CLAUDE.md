# Creators Studio — agent guide

Electron + React + TypeScript desktop chat app wrapping the Claude Agent SDK. The main process spawns the SDK, streams events to the renderer over a zod-validated IPC channel, and asks the user for permission whenever the SDK wants to invoke a tool not covered by the bundled allow list.

## Run & test

The user runs `npm start` (Vite watch mode) in a separate terminal. **Do not run build commands** — the watcher picks up your edits automatically.

- `npm start` — Electron + Vite HMR (user's responsibility)
- `npm test` — Playwright E2E. `tests/global-setup.ts` packages the app with `TEST_BUILD=1` on the first run and caches the result via `out/.test-build`; it re-packages if either the binary or the marker is missing.
- `npm run lint` / `lint:css` / `format` — WordPress-flavored ESLint, Stylelint, wp-prettier.

E2E specs talk to the real Anthropic API and need `ANTHROPIC_API_KEY` in `.env` or the shell. The bash spec also needs the app to boot with `CREATORS_STUDIO_PROJECTS` pointed at a tmp dir (the spec sets this itself).

## Visual inspection via Playwright MCP

Unpackaged builds expose CDP on `localhost:9222` (`main.ts`, gated by `! app.isPackaged`); `.mcp.json` registers a Playwright MCP server against it. Agents drive the live dev window via `browser_click` / `browser_type` / `browser_take_screenshot` / `browser_run_code`.

Quirks:

- **Screenshots lose the backdrop.** The window uses transparent bg + macOS vibrancy; CDP captures web contents only, so transparent pixels come back white. Inject `html, body { background: ... }` before shooting, remove after.
- **Dark mode needs `page.emulateMedia({ colorScheme: 'dark' })`** via `browser_run_code` — `matchMedia` reflects Chromium's emulation, not the OS.
- **Reloads drop the session.** `Target ... has been closed` on the next call is expected; retry and the MCP re-attaches.
- **Don't commit `page-*.png` / `app-*.png`** — they land in the repo root.

## Layout

```
src/
  main/
    main.ts          Electron lifecycle, window, ipcMain handlers
    agentService.ts  Wraps SDK query(), handles permissions, tool events
    ipc.ts           Channel names + zod schemas for all IPC payloads
  preload/
    preload.ts       Exposes window.api via contextBridge
  renderer/
    App.tsx          Message list, streaming state, permission gate
    components/
      PermissionPrompt.tsx  Modal for canUseTool requests
      ToolBlock.tsx         Tool-use card; Bash gets a dedicated view
    lib/
      stripAnsi.ts   Strips ANSI escapes from tool output
    index.css        Single stylesheet (wp-stylelint)
resources/
  claude-defaults.json  Bundled allow/deny; shipped via extraResource
tests/
  global-setup.ts       Packages app with TEST_BUILD=1 on demand
  e2e/
    shell.spec.ts       UI layout, drag regions, composer state
    agent.spec.ts       Real Claude round-trip, streaming assertions
    bash.spec.ts        Pre-approved curl passes without a prompt
```

## Key decisions (and the reasons)

**Native SDK binary is a runtime dependency.** The Agent SDK exec's `@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude` at runtime, so `forge.config.ts` copies the whole package dir into `Contents/Resources` via `extraResource`. `resolveClaudeCodeBinary()` in `agentService.ts` checks `process.resourcesPath` first (packaged), then falls back to `node_modules` (dev). If you bump the SDK version, re-verify both paths resolve.

**`resources/claude-defaults.json` overrides the user's `~/.claude/settings.json`.** Passed to the SDK as `options.settings`. New allow/deny patterns belong here, not in personal config. The file ships as an `extraResource`; `resolveBundledSettingsPath()` does the same packaged-vs-dev split as the binary.

**Hardened fuses by default; `TEST_BUILD=1` is the only escape hatch.** Relaxes `EnableNodeCliInspectArguments` so Playwright's debugger can attach. Cookie encryption stays off because we don't yet have Developer ID signing — an unsigned build can't use the keychain anyway. Never set `TEST_BUILD` for distribution.

**Permission flow is request/response, with an in-session memory.** `canUseTool` generates a `requestId`, emits `permission-request`, and parks the promise in `pendingPermissions`. The renderer resolves it by calling `window.api.permission.respond(requestId, decision, remember)`. `remember: true` adds the tool name to `allowForSession`, skipping the round-trip on subsequent calls within the same SDK session. The set is cleared when `send()` finishes.


## IPC protocol

Channels (`IpcChannels` in `src/main/ipc.ts`):

- `chat:send` — renderer → main. `{ prompt: string }`. Returns when the SDK run completes.
- `chat:event` — main → renderer. `AgentEvent` discriminated union: `init | text-delta | tool-use-start | tool-result | permission-request | result | done | error`.
- `permission:respond` — renderer → main. `{ requestId, decision: 'allow'|'deny', remember: boolean }`.

Message lifecycle: `init` → zero or more `text-delta` / `tool-use-start` / `tool-result` / `permission-request` → `result` → `done`. `error` may arrive at any point; `done` still follows.

## Test IDs

Renderer elements carry `data-testid` for Playwright. Keep these stable — E2E specs depend on them.

- Shell: `titlebar`, `transcript`, `composer`, `chat-input`, `send-button`
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

## Verify & Quality
For any task make sure the agents have a way to verify its success and things working.
Do things step by step when possible and verify each step.
If you found something unexpected or that you feel requires some hack let the human know about the unexpected situation and why an "hack" was needed.
