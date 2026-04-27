/**
 * IPC channel-name constants and renderer → main handler registration.
 *
 * Channels (invoke + push) and any schemas exclusive to a single channel
 * live in src/main/channels/<name>.ts via `defineChannel` / `defineEvent`.
 * Cross-process domain types live in src/types.ts.
 *
 * Naming: `domain:action` — three entity prefixes:
 *   - `project:` / `projects:` — linked workspace records (CRUD; plural for list)
 *   - `chat:` / `chats:`       — persisted conversation records on disk
 *   - `agent:`                 — Claude Agent SDK runtime: send, event stream,
 *                                permission gating, starter prompts
 * Singular for single-record actions (`chat:create`, `project:remove`),
 * plural for list actions (`chats:list`, `projects:list`). Mirror this on
 * the renderer side: `window.api.agent.send`, `window.api.chat.create`,
 * `window.api.chats.list`, etc.
 *
 * Adding a channel:
 *   1. Create src/main/channels/<name>.ts that exports a `defineChannel`
 *      object (see channels/utils/define-channel.ts).
 *   2. Import it here and add it to the `channels` array.
 *   3. Expose it on `window.api` in src/preload/preload.ts using IpcChannels.*.
 *
 * `registerIpcHandlers` iterates the array once and binds each channel — no
 * per-channel `ipcMain.handle` lines to maintain.
 *
 * Push channels (main → renderer via webContents.send, e.g. `agent:onEvent`)
 * also live under `channels/` but use `defineEvent` instead of `defineChannel`,
 * and are imported directly by their producer (e.g. AgentService) rather than
 * registered here — they have no router-side wiring.
 */

import { ipcMain } from 'electron';

import { agentGetPrompt } from './channels/agent-get-prompt';
import { agentRespondPermission } from './channels/agent-respond-permission';
import { agentSend } from './channels/agent-send';
import { chatCreate } from './channels/chat-create';
import { chatLoad } from './channels/chat-load';
import { chatsList } from './channels/chats-list';
import { chatsRecent } from './channels/chats-recent';
import { projectCreate } from './channels/project-create';
import { projectPickPath } from './channels/project-pick-path';
import { projectRemove } from './channels/project-remove';
import { projectsList } from './channels/projects-list';

export const IpcChannels = {
	agentGetPrompt: 'agent:getPrompt',
	agentOnEvent: 'agent:onEvent',
	agentRespondPermission: 'agent:respondPermission',
	agentSend: 'agent:send',
	chatCreate: 'chat:create',
	chatLoad: 'chat:load',
	chatsList: 'chats:list',
	chatsRecent: 'chats:recent',
	projectCreate: 'project:create',
	projectPickPath: 'project:pickPath',
	projectRemove: 'project:remove',
	projectsList: 'projects:list',
} as const;

const channels = [
	agentGetPrompt,
	agentRespondPermission,
	agentSend,
	chatCreate,
	chatLoad,
	chatsList,
	chatsRecent,
	projectCreate,
	projectPickPath,
	projectRemove,
	projectsList,
] as const;

export function registerIpcHandlers(): void {
	for ( const channel of channels ) {
		ipcMain.handle( channel.name, channel.invoke );
	}
}
