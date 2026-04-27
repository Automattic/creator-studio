/**
 * IPC channel-name constants and renderer → main handler registration.
 *
 * Channels (invoke + push) and any schemas exclusive to a single channel
 * live in src/main/channels/<name>.ts via `defineChannel` / `defineEvent`.
 * Cross-process domain types live in src/types.ts.
 *
 * Naming: `domain:action` — singular `domain:` for single-record actions
 * (`chat:create`, `project:remove`), plural `domain:` for list actions
 * (`chats:list`, `chats:recent`, `projects:list`). Mirror this on the
 * renderer side: `window.api.chat.create`, `window.api.chats.list`, etc.
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
 * Push channels (main → renderer via webContents.send, e.g. `chat:onEvent`)
 * also live under `channels/` but use `defineEvent` instead of `defineChannel`,
 * and are imported directly by their producer (e.g. AgentService) rather than
 * registered here — they have no router-side wiring.
 */

import { ipcMain } from 'electron';

import { chatCreate } from './channels/chat-create';
import { chatLoad } from './channels/chat-load';
import { chatSend } from './channels/chat-send';
import { chatsList } from './channels/chats-list';
import { chatsRecent } from './channels/chats-recent';
import { permissionRespond } from './channels/permission-respond';
import { projectCreate } from './channels/project-create';
import { projectPickPath } from './channels/project-pick-path';
import { projectRemove } from './channels/project-remove';
import { projectsList } from './channels/projects-list';
import { promptGet } from './channels/prompt-get';

export const IpcChannels = {
	chatCreate: 'chat:create',
	chatLoad: 'chat:load',
	chatOnEvent: 'chat:onEvent',
	chatSend: 'chat:send',
	chatsList: 'chats:list',
	chatsRecent: 'chats:recent',
	permissionRespond: 'permission:respond',
	projectCreate: 'project:create',
	projectPickPath: 'project:pickPath',
	projectRemove: 'project:remove',
	projectsList: 'projects:list',
	promptGet: 'prompt:get',
} as const;

const channels = [
	chatCreate,
	chatLoad,
	chatSend,
	chatsList,
	chatsRecent,
	permissionRespond,
	projectCreate,
	projectPickPath,
	projectRemove,
	projectsList,
	promptGet,
] as const;

export function registerIpcHandlers(): void {
	for ( const channel of channels ) {
		ipcMain.handle( channel.name, channel.invoke );
	}
}
