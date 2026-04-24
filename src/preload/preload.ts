import { contextBridge, ipcRenderer } from 'electron';

import {
	IpcChannels,
	type AgentEvent,
	type ChatKind,
	type ChatMeta,
	type Folder,
	type PersistedMessage,
	type PromptName,
} from '../main/ipc';

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
		add: (): Promise< Folder | null > =>
			ipcRenderer.invoke( IpcChannels.foldersAdd ),
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
	},
	prompts: {
		get: ( name: PromptName, folderId: string ): Promise< string > =>
			ipcRenderer.invoke( IpcChannels.promptsGet, { name, folderId } ),
	},
};

contextBridge.exposeInMainWorld( 'api', api );

export type Api = typeof api;
