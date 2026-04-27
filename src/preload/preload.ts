import { contextBridge, ipcRenderer } from 'electron';

import { IpcChannels } from '../main/ipc';
import type {
	AgentEvent,
	ChatKind,
	ChatMeta,
	Folder,
	PersistedMessage,
	PromptName,
	RecentChat,
} from '../types';

const api = {
	chat: {
		send: (
			prompt: string,
			folderId: string,
			chatId?: string
		): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.chatSend, {
				prompt,
				folderId,
				chatId,
			} ),
		onEvent: ( cb: ( event: AgentEvent ) => void ): ( () => void ) => {
			const listener = (
				_: Electron.IpcRendererEvent,
				event: AgentEvent
			): void => cb( event );
			ipcRenderer.on( IpcChannels.chatOnEvent, listener );
			return () => ipcRenderer.off( IpcChannels.chatOnEvent, listener );
		},
	},
	permission: {
		respond: (
			requestId: string,
			folderId: string,
			decision: 'allow' | 'deny',
			remember: boolean
		): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.permissionRespond, {
				requestId,
				folderId,
				decision,
				remember,
			} ),
	},
	folders: {
		list: (): Promise< Folder[] > =>
			ipcRenderer.invoke( IpcChannels.foldersList ),
		pickPath: (): Promise< string | null > =>
			ipcRenderer.invoke( IpcChannels.foldersPickPath ),
		create: ( input: {
			path: string;
			name: string;
			goal?: string;
		} ): Promise< Folder > =>
			ipcRenderer.invoke( IpcChannels.foldersCreate, input ),
		remove: ( id: string ): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.foldersRemove, { id } ),
	},
	chats: {
		load: (
			folderId: string,
			chatId: string
		): Promise< PersistedMessage[] > =>
			ipcRenderer.invoke( IpcChannels.chatsLoad, { folderId, chatId } ),
		list: ( folderId: string ): Promise< ChatMeta[] > =>
			ipcRenderer.invoke( IpcChannels.chatsList, { folderId } ),
		create: (
			folderId: string,
			options: { kind?: ChatKind; title?: string } = {}
		): Promise< ChatMeta | null > =>
			ipcRenderer.invoke( IpcChannels.chatsCreate, {
				folderId,
				kind: options.kind,
				title: options.title,
			} ),
		recent: (): Promise< RecentChat[] > =>
			ipcRenderer.invoke( IpcChannels.chatsRecent ),
	},
	prompts: {
		get: ( name: PromptName, folderId: string ): Promise< string > =>
			ipcRenderer.invoke( IpcChannels.promptsGet, { name, folderId } ),
	},
};

contextBridge.exposeInMainWorld( 'api', api );

export type Api = typeof api;
