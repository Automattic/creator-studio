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
