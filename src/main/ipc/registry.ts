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
 * Push channels (e.g. `chat:onEvent`, sent via webContents.send) are not in
 * this registry; they're not request/response so `defineChannel` doesn't
 * apply. Their names live in IpcChannels and their payload schemas in ./.
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
