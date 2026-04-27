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
		create: (
			projectId: string,
			options: { kind?: ChatKind; title?: string } = {}
		): Promise< ChatMeta | null > =>
			ipcRenderer.invoke( IpcChannels.chatCreate, {
				projectId,
				kind: options.kind,
				title: options.title,
			} ),
		load: (
			projectId: string,
			chatId: string
		): Promise< PersistedMessage[] > =>
			ipcRenderer.invoke( IpcChannels.chatLoad, { projectId, chatId } ),
	},
	chats: {
		list: ( projectId: string ): Promise< ChatMeta[] > =>
			ipcRenderer.invoke( IpcChannels.chatsList, { projectId } ),
		recent: (): Promise< RecentChat[] > =>
			ipcRenderer.invoke( IpcChannels.chatsRecent ),
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
	project: {
		create: ( input: {
			path: string;
			name: string;
			goal?: string;
		} ): Promise< Project > =>
			ipcRenderer.invoke( IpcChannels.projectCreate, input ),
		pickPath: (): Promise< string | null > =>
			ipcRenderer.invoke( IpcChannels.projectPickPath ),
		remove: ( id: string ): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.projectRemove, { id } ),
	},
	projects: {
		list: (): Promise< Project[] > =>
			ipcRenderer.invoke( IpcChannels.projectsList ),
	},
	prompt: {
		get: ( name: PromptName, projectId: string ): Promise< string > =>
			ipcRenderer.invoke( IpcChannels.promptGet, { name, projectId } ),
	},
};

contextBridge.exposeInMainWorld( 'api', api );

export type Api = typeof api;
