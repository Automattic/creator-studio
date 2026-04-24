import { contextBridge, ipcRenderer } from 'electron';

import type {
	AgentEvent,
	ChatKind,
	ChatMeta,
	Folder,
	PersistedMessage,
} from '../main/ipc';

const api = {
	chat: {
		send: ( prompt: string, folderId: string ): Promise< void > =>
			ipcRenderer.invoke( 'chat:send', { prompt, folderId } ),
		onEvent: ( cb: ( event: AgentEvent ) => void ): ( () => void ) => {
			const listener = (
				_: Electron.IpcRendererEvent,
				event: AgentEvent
			): void => cb( event );
			ipcRenderer.on( 'chat:event', listener );
			return () => ipcRenderer.off( 'chat:event', listener );
		},
	},
	permission: {
		respond: (
			requestId: string,
			folderId: string,
			decision: 'allow' | 'deny',
			remember: boolean
		): Promise< void > =>
			ipcRenderer.invoke( 'permission:respond', {
				requestId,
				folderId,
				decision,
				remember,
			} ),
	},
	folders: {
		list: (): Promise< Folder[] > => ipcRenderer.invoke( 'folders:list' ),
		add: (): Promise< Folder | null > =>
			ipcRenderer.invoke( 'folders:add' ),
		remove: ( id: string ): Promise< void > =>
			ipcRenderer.invoke( 'folders:remove', { id } ),
	},
	chats: {
		load: (
			folderId: string,
			chatId: string
		): Promise< PersistedMessage[] > =>
			ipcRenderer.invoke( 'chats:load', { folderId, chatId } ),
		list: ( folderId: string ): Promise< ChatMeta[] > =>
			ipcRenderer.invoke( 'chats:list', { folderId } ),
		create: (
			folderId: string,
			options: { kind?: ChatKind; title?: string } = {}
		): Promise< ChatMeta | null > =>
			ipcRenderer.invoke( 'chats:create', {
				folderId,
				kind: options.kind,
				title: options.title,
			} ),
	},
};

contextBridge.exposeInMainWorld( 'api', api );

export type Api = typeof api;
