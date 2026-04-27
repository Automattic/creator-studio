import { contextBridge, ipcRenderer } from 'electron';

import { IpcChannels } from '../main/ipc';
import type {
	AgentEvent,
	ChatKind,
	ChatMeta,
	PersistedMessage,
	Project,
	PromptName,
	RecentChat,
} from '../types';

const api = {
	chat: {
		send: (
			prompt: string,
			projectId: string,
			chatId?: string
		): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.chatSend, {
				prompt,
				projectId,
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
			projectId: string,
			decision: 'allow' | 'deny',
			remember: boolean
		): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.permissionRespond, {
				requestId,
				projectId,
				decision,
				remember,
			} ),
	},
	projects: {
		list: (): Promise< Project[] > =>
			ipcRenderer.invoke( IpcChannels.projectsList ),
		pickPath: (): Promise< string | null > =>
			ipcRenderer.invoke( IpcChannels.projectsPickPath ),
		create: ( input: {
			path: string;
			name: string;
			goal?: string;
		} ): Promise< Project > =>
			ipcRenderer.invoke( IpcChannels.projectsCreate, input ),
		remove: ( id: string ): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.projectsRemove, { id } ),
	},
	chats: {
		load: (
			projectId: string,
			chatId: string
		): Promise< PersistedMessage[] > =>
			ipcRenderer.invoke( IpcChannels.chatsLoad, { projectId, chatId } ),
		list: ( projectId: string ): Promise< ChatMeta[] > =>
			ipcRenderer.invoke( IpcChannels.chatsList, { projectId } ),
		create: (
			projectId: string,
			options: { kind?: ChatKind; title?: string } = {}
		): Promise< ChatMeta | null > =>
			ipcRenderer.invoke( IpcChannels.chatsCreate, {
				projectId,
				kind: options.kind,
				title: options.title,
			} ),
		recent: (): Promise< RecentChat[] > =>
			ipcRenderer.invoke( IpcChannels.chatsRecent ),
	},
	prompts: {
		get: ( name: PromptName, projectId: string ): Promise< string > =>
			ipcRenderer.invoke( IpcChannels.promptsGet, { name, projectId } ),
	},
};

contextBridge.exposeInMainWorld( 'api', api );

export type Api = typeof api;
