# `src/main/`

Electron main process.

## Entities

Four prefixes carry across every layer (channel file, service file, IPC name, `window.api` namespace):

-   **agent** — Claude Agent SDK runtime: starting a run, streaming events to the renderer, and gating tool-use permissions.
-   **chat** / **chats** — persisted conversation records on disk (`<project>/.creator-studio/chats.json` metadata + `chats/<id>.jsonl` log). Singular for one-record actions, plural for listings.
-   **project** / **projects** — linked workspace records (`projects.json` in userData). Singular for one-record actions, plural for listings.
-   **prompt** — bundled starter templates (`resources/prompts/*.md`) with `{{project}}` substituted at fetch time.

Naming rule: singular `domain:` for single-record actions (`chat:create`, `project:remove`, `prompt:get`), plural for list actions (`chats:list`, `projects:list`). The same word is used at every layer — channel file `channels/chat-create.ts`, service file `services/chat-create.ts`, exported function `createChat`, and renderer surface `window.api.chat.create`.

## Channels vs. services

-   **Channels** (`channels/`) are the IPC wire layer. Each file declares a single `defineChannel({ name, input, handle })` — a zod-validated renderer → main request/response — or a `defineEvent({ name, payload })` for main → renderer push (e.g. `agent:onEvent`). Handlers stay thin: parse input, delegate, return. They are wired once at boot by `ipc.ts` (which iterates a flat array and calls `ipcMain.handle`); push events are imported directly by their producer (e.g. `AgentService`) and never go through the registry.
-   **Services** (`services/`) are the work layer. They touch the filesystem, Electron APIs, the Claude Agent SDK, or shared in-memory state. A channel handler usually calls one service function with the same name (`chat-create.ts` → `createChat`); shared helpers with no IPC surface live in `services/utils/`.

The split exists so the IPC boundary stays a thin, schema-validated facade and the work is independently testable — unit tests import services directly without going through Electron.

## Adding a channel

1. Create `channels/<name>.ts` exporting a `defineChannel({ ... })` (or `defineEvent({ ... })`).
2. Add the channel name to `IpcChannels` in `ipc.ts`, and (for invoke channels) add it to the `channels` array in the same file.
3. Expose it on `window.api` in `src/preload/preload.ts` using `IpcChannels.*`.
4. If the handler does any real work, add a matching `services/<name>.ts` and have the channel delegate to it.
