/**
 * Registers every renderer → main IPC channel with Electron at boot.
 *
 * Adding a channel:
 *   1. Create src/main/ipc/channels/<name>.ts that exports a `defineChannel`
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
import { foldersAdd } from './channels/folders-add';
import { foldersList } from './channels/folders-list';
import { foldersRemove } from './channels/folders-remove';
import { permissionRespond } from './channels/permission-respond';
import { promptsGet } from './channels/prompts-get';

const channels = [
	chatSend,
	chatsCreate,
	chatsList,
	chatsLoad,
	foldersAdd,
	foldersList,
	foldersRemove,
	permissionRespond,
	promptsGet,
] as const;

export function registerIpcHandlers(): void {
	for ( const channel of channels ) {
		ipcMain.handle( channel.name, channel.invoke );
	}
}
