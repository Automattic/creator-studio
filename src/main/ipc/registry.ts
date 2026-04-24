/**
 * Single registry of every renderer → main IPC channel. Adding a channel:
 *   1. Create src/main/ipc/channels/<name>.ts that exports a `defineChannel`
 *      object (see define-channel.ts).
 *   2. Import it here and add it to the `channels` array.
 *   3. Expose it on `window.api` in src/preload/preload.ts using IpcChannels.*.
 *
 * The router in ./router.ts iterates this list once at boot — no per-channel
 * `ipcMain.handle` lines to maintain.
 *
 * Push channels (main → renderer via webContents.send, e.g. `chat:onEvent`)
 * also live under `channels/` but use `defineEvent` instead of `defineChannel`,
 * and are imported directly by their producer (e.g. AgentService) rather than
 * registered here — they have no router-side wiring.
 */

import { chatSend } from './channels/chat-send';
import { chatsCreate } from './channels/chats-create';
import { chatsList } from './channels/chats-list';
import { chatsLoad } from './channels/chats-load';
import { foldersAdd } from './channels/folders-add';
import { foldersList } from './channels/folders-list';
import { foldersRemove } from './channels/folders-remove';
import { permissionRespond } from './channels/permission-respond';
import { promptsGet } from './channels/prompts-get';

export const channels = [
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
