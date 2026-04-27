/**
 * IPC channel-name constants and renderer → main handler registration.
 *
 * Channels (invoke + push) and any schemas exclusive to a single channel
 * live in src/main/channels/<name>.ts via `defineChannel` / `defineEvent`.
 * Cross-process domain types live in src/types.ts.
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

import { chatSend } from './channels/chat-send';
import { chatsCreate } from './channels/chats-create';
import { chatsList } from './channels/chats-list';
import { chatsLoad } from './channels/chats-load';
import { chatsRecent } from './channels/chats-recent';
import { projectsCreate } from './channels/projects-create';
import { projectsList } from './channels/projects-list';
import { projectsPickPath } from './channels/projects-pick-path';
import { projectsRemove } from './channels/projects-remove';
import { permissionRespond } from './channels/permission-respond';
import { promptsGet } from './channels/prompts-get';

export const IpcChannels = {
	chatOnEvent: 'chat:onEvent',
	chatSend: 'chat:send',
	chatsCreate: 'chats:create',
	chatsList: 'chats:list',
	chatsLoad: 'chats:load',
	chatsRecent: 'chats:recent',
	projectsCreate: 'projects:create',
	projectsList: 'projects:list',
	projectsPickPath: 'projects:pickPath',
	projectsRemove: 'projects:remove',
	permissionRespond: 'permission:respond',
	promptsGet: 'prompts:get',
} as const;

const channels = [
	chatSend,
	chatsCreate,
	chatsList,
	chatsLoad,
	chatsRecent,
	projectsCreate,
	projectsList,
	projectsPickPath,
	projectsRemove,
	permissionRespond,
	promptsGet,
] as const;

export function registerIpcHandlers(): void {
	for ( const channel of channels ) {
		ipcMain.handle( channel.name, channel.invoke );
	}
}
