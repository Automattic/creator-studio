import { contextBridge, ipcRenderer } from 'electron';

import { IpcChannels } from '../main/channels';
import type {
	AgentEvent,
	ChatMeta,
	DirEntry,
	Draft,
	PersistedMessage,
	Project,
	ProjectUiPrefs,
	PromptName,
	RecentChat,
	SearchHit,
	UiPrefs,
} from '../types';

const api = {
	agent: {
		cancel: ( projectId: string, chatId: string ): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.agentCancel, {
				projectId,
				chatId,
			} ),
		send: (
			prompt: string,
			projectId: string,
			chatId?: string
		): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.agentSend, {
				prompt,
				projectId,
				chatId,
			} ),
		onEvent: ( cb: ( event: AgentEvent ) => void ): ( () => void ) => {
			const listener = (
				_: Electron.IpcRendererEvent,
				event: AgentEvent
			): void => cb( event );
			ipcRenderer.on( IpcChannels.agentOnEvent, listener );
			return () => ipcRenderer.off( IpcChannels.agentOnEvent, listener );
		},
		respondPermission: (
			requestId: string,
			projectId: string,
			decision: 'allow' | 'deny',
			remember: boolean
		): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.agentRespondPermission, {
				requestId,
				projectId,
				decision,
				remember,
			} ),
	},
	chat: {
		create: (
			projectId: string,
			options: { title?: string; draftPath?: string } = {}
		): Promise< ChatMeta | null > =>
			ipcRenderer.invoke( IpcChannels.chatCreate, {
				projectId,
				title: options.title,
				draftPath: options.draftPath,
			} ),
		load: (
			projectId: string,
			chatId: string
		): Promise< PersistedMessage[] > =>
			ipcRenderer.invoke( IpcChannels.chatLoad, { projectId, chatId } ),
		remove: ( projectId: string, chatId: string ): Promise< boolean > =>
			ipcRenderer.invoke( IpcChannels.chatRemove, { projectId, chatId } ),
		rename: (
			projectId: string,
			chatId: string,
			title: string
		): Promise< ChatMeta | null > =>
			ipcRenderer.invoke( IpcChannels.chatRename, {
				projectId,
				chatId,
				title,
			} ),
	},
	chats: {
		list: ( projectId: string ): Promise< ChatMeta[] > =>
			ipcRenderer.invoke( IpcChannels.chatsList, { projectId } ),
		recent: (): Promise< RecentChat[] > =>
			ipcRenderer.invoke( IpcChannels.chatsRecent ),
	},
	drafts: {
		listAll: (): Promise< Draft[] > =>
			ipcRenderer.invoke( IpcChannels.draftsListAll ),
		read: (
			projectId: string,
			relPath: string
		): Promise< {
			title: string;
			body: string;
			frontmatter: Record< string, unknown >;
			mtime: number;
		} | null > =>
			ipcRenderer.invoke( IpcChannels.draftsRead, {
				projectId,
				relPath,
			} ),
		write: (
			projectId: string,
			relPath: string,
			payload: {
				title: string;
				body: string;
				frontmatter: Record< string, unknown >;
				expectedMtime: number | null;
			}
		): Promise<
			| { ok: true; mtime: number }
			| {
					ok: false;
					reason: 'not-found' | 'mtime-conflict' | 'io-error';
			  }
		> =>
			ipcRenderer.invoke( IpcChannels.draftsWrite, {
				projectId,
				relPath,
				...payload,
			} ),
	},
	project: {
		create: ( input: {
			path: string;
			name: string;
			goal?: string;
		} ): Promise< Project > =>
			ipcRenderer.invoke( IpcChannels.projectCreate, input ),
		listFiles: ( projectId: string, subPath = '' ): Promise< DirEntry[] > =>
			ipcRenderer.invoke( IpcChannels.projectListFiles, {
				projectId,
				subPath,
			} ),
		pickPath: (): Promise< string | null > =>
			ipcRenderer.invoke( IpcChannels.projectPickPath ),
		readFile: (
			projectId: string,
			subPath: string
		): Promise< { text: string; mtime: number | null } | null > =>
			ipcRenderer.invoke( IpcChannels.projectReadFile, {
				projectId,
				subPath,
			} ),
		remove: ( id: string ): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.projectRemove, { id } ),
		searchFiles: (
			projectId: string,
			query: string,
			folders: string[]
		): Promise< SearchHit[] > =>
			ipcRenderer.invoke( IpcChannels.projectSearchFiles, {
				projectId,
				query,
				folders,
			} ),
		uiPrefs: {
			get: ( projectId: string ): Promise< ProjectUiPrefs > =>
				ipcRenderer.invoke( IpcChannels.projectUiPrefsGet, {
					projectId,
				} ),
			set: (
				projectId: string,
				patch: Partial< ProjectUiPrefs >
			): Promise< ProjectUiPrefs > =>
				ipcRenderer.invoke( IpcChannels.projectUiPrefsSet, {
					projectId,
					patch,
				} ),
		},
	},
	projects: {
		list: (): Promise< Project[] > =>
			ipcRenderer.invoke( IpcChannels.projectsList ),
	},
	prompt: {
		get: (
			name: PromptName,
			projectId: string,
			filePath?: string
		): Promise< string > =>
			ipcRenderer.invoke( IpcChannels.promptGet, {
				name,
				projectId,
				filePath,
			} ),
	},
	uiPrefs: {
		get: (): Promise< UiPrefs > =>
			ipcRenderer.invoke( IpcChannels.uiPrefsGet ),
		set: ( patch: Partial< UiPrefs > ): Promise< UiPrefs > =>
			ipcRenderer.invoke( IpcChannels.uiPrefsSet, patch ),
	},
};

contextBridge.exposeInMainWorld( 'api', api );

export type Api = typeof api;
