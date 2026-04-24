/**
 * IPC route table: each channel in ./ipc.ts is bound to one handler in
 * ./ipc-handlers/. Called once during main-process boot.
 *
 * Adding a new channel (renderer → main):
 *   1. Add the channel name to IpcChannels in ./ipc.ts.
 *   2. Add its zod request schema to ./ipc.ts.
 *   3. Add a handler file under ./ipc-handlers/ that parses the payload.
 *   4. Wire it below.
 *   5. Expose it on window.api in src/preload/preload.ts, using IpcChannels.*
 *      (never raw strings — the constant is the single source of truth).
 */

import { ipcMain } from 'electron';

import { IpcChannels } from './ipc';
import { chatSend } from './ipc-handlers/chat-send';
import { chatsCreate } from './ipc-handlers/chats-create';
import { chatsList } from './ipc-handlers/chats-list';
import { chatsLoad } from './ipc-handlers/chats-load';
import { foldersAdd } from './ipc-handlers/folders-add';
import { foldersList } from './ipc-handlers/folders-list';
import { foldersRemove } from './ipc-handlers/folders-remove';
import { permissionRespond } from './ipc-handlers/permission-respond';
import { promptsGet } from './ipc-handlers/prompts-get';

export function registerIpcHandlers(): void {
	ipcMain.handle( IpcChannels.chatSend, chatSend );
	ipcMain.handle( IpcChannels.permissionRespond, permissionRespond );
	ipcMain.handle( IpcChannels.foldersList, foldersList );
	ipcMain.handle( IpcChannels.foldersAdd, foldersAdd );
	ipcMain.handle( IpcChannels.foldersRemove, foldersRemove );
	ipcMain.handle( IpcChannels.chatsLoad, chatsLoad );
	ipcMain.handle( IpcChannels.chatsList, chatsList );
	ipcMain.handle( IpcChannels.chatsCreate, chatsCreate );
	ipcMain.handle( IpcChannels.promptsGet, promptsGet );
}
