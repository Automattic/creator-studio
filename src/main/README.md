# `src/main/`

Electron main process.

```
main.ts          Electron entry: app lifecycle, BrowserWindow, calls registerIpcHandlers()
ipc.ts           IpcChannels constant + registerIpcHandlers() (called once at boot)
channels/        One file per channel — three entity prefixes:
  agent-*          SDK runtime: send, event stream, permission gating, starter prompts
  chat-* / chats-* Persisted conversation records (CRUD; plural for list)
  project-* / projects-* Linked workspace records (CRUD; plural for list)
  utils/
    define-channel.ts   defineChannel + defineEvent helpers
services/        Stateful / I/O-touching modules used by channel handlers
  agent-service.ts     AgentService — wraps the Claude Agent SDK
  agent-get.ts         One AgentService per (webContents, projectId)
  chat-append.ts       Append a persisted message to a chat's jsonl
  chat-create.ts       Create a new chat under a project
  chat-load.ts         Read a chat's persisted message log
  chat-session.ts      Per-chat SDK session id (get/set) + DEFAULT_CHAT_ID
  chats-list.ts        Chats inside a project, oldest first
  chats-recent.ts      Recently-active chats across every project
  project-create.ts    Add a linked project record
  project-get.ts       Look up a project by id
  project-pick-path.ts Show the OS folder picker
  project-remove.ts    Drop a linked project record
  projects-list.ts     All linked projects
  utilities/           Shared helpers (no IPC surface of their own)
    chat-store.ts      paths + chats.json read/write/touch + DEFAULT_CHAT_ID
    project-store.ts   projects.json read/write + legacy migration
    permissions.ts     canUseTool helpers (path checks, bash parsers)
    prompts.ts         Prompt-template {{project}} substitution
    resource-paths.ts  Locate bundled binary / settings / prompts (packaged vs dev)
```

## Nomenclature

-   **Channel** — renderer → main, request/response. Defined with `defineChannel({ name, input, handle })`. Validated by zod, wired by `ipc.ts`. Renderer side: `window.api.x.y(...)` → `ipcRenderer.invoke`.
-   **Event** — main → renderer, fire-and-forget push. Defined with `defineEvent({ name, payload })`. Imported directly by its producer (e.g. `AgentService`); not in the registry. Renderer side: `ipcRenderer.on`.
-   **Channel name** — `domain:action` with three entity prefixes: `agent` (SDK runtime — `agent:send`, `agent:onEvent`, `agent:respondPermission`, `agent:getPrompt`), `chat`/`chats` (persisted conversation records — `chat:create`, `chat:load`, `chats:list`, `chats:recent`), `project`/`projects` (workspace records — `project:create`, `project:remove`, `project:pickPath`, `projects:list`). Singular for single-record actions; plural for list actions. The same rule applies at every layer: file name (`channels/chat-create.ts`, `services/chat-create.ts`), exported function (`createChat`), and renderer surface (`window.api.chat.create`, `window.api.chats.list`, `window.api.agent.send`).
-   **Service** — anything under `services/`. Touches the filesystem, Electron APIs, or external SDKs. Channel handlers stay thin and delegate here.
-   **Handler** — the `handle` callback inside `defineChannel`. Parsed input in, return value (or void) out.

## Adding a channel

1. New file under `channels/<name>.ts` exporting a `defineChannel({ ... })` (or `defineEvent({ ... })`).
2. Add the channel name to `IpcChannels` in `ipc.ts`, and (for invoke channels) add it to the `channels` array in the same file.
3. Expose on `window.api` in `src/preload/preload.ts` using `IpcChannels.*`.
