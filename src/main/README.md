# `src/main/`

Electron main process.

```
main.ts          Electron entry: app lifecycle, BrowserWindow, calls registerIpcHandlers()
ipc.ts           IpcChannels constant + registerIpcHandlers() (called once at boot)
channels/        One file per channel
  utils/
    define-channel.ts   defineChannel + defineEvent helpers
services/        Stateful / I/O-touching modules used by channel handlers
  agent.ts         AgentService — wraps the Claude Agent SDK
  agentRegistry.ts One AgentService per (webContents, projectId)
  chat.ts          Per-project chat metadata + jsonl log
  project.ts       Linked-project list (projects.json)
  permissions.ts   Pure canUseTool helpers (path checks, bash parsers)
  prompts.ts       Bundled prompt loader + {{project}} substitution
```

## Nomenclature

-   **Channel** — renderer → main, request/response. Defined with `defineChannel({ name, input, handle })`. Validated by zod, wired by `registry.ts`. Renderer side: `window.api.x.y(...)` → `ipcRenderer.invoke`.
-   **Event** — main → renderer, fire-and-forget push. Defined with `defineEvent({ name, payload })`. Imported directly by its producer (e.g. `AgentService`); not in the registry. Renderer side: `ipcRenderer.on`.
-   **Channel name** — `domain:action` (e.g. `chats:create`, `chat:onEvent`). Plural `chats:` for resource CRUD; singular `chat:` for the agent-interaction stream.
-   **Service** — anything under `services/`. Touches the filesystem, Electron APIs, or external SDKs. Channel handlers stay thin and delegate here.
-   **Handler** — the `handle` callback inside `defineChannel`. Parsed input in, return value (or void) out.

## Adding a channel

1. New file under `channels/<name>.ts` exporting a `defineChannel({ ... })` (or `defineEvent({ ... })`).
2. Add the channel name to `IpcChannels` in `ipc.ts`, and (for invoke channels) add it to the `channels` array in the same file.
3. Expose on `window.api` in `src/preload/preload.ts` using `IpcChannels.*`.
