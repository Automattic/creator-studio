import { contextBridge, ipcRenderer } from 'electron';

import { IpcChannels } from '../main/channels';
import type {
	AgentEvent,
	ChatMeta,
	DirEntry,
	Draft,
	DraftAttachment,
	DraftFileChanged,
	MessageSelection,
	PersistedMessage,
	Project,
	ProjectUiPrefs,
	PromptName,
	RecentChat,
	ResolvedUrlImport,
	SearchHit,
	Settings,
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
			chatId?: string,
			opts: {
				userMessageText?: string;
				attachments?: DraftAttachment[];
				selections?: MessageSelection[];
			} = {}
		): Promise< void > =>
			ipcRenderer.invoke( IpcChannels.agentSend, {
				prompt,
				projectId,
				chatId,
				userMessageText: opts.userMessageText,
				attachments: opts.attachments,
				selections: opts.selections,
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
			options: { title?: string; draftRelPath?: string } = {}
		): Promise< ChatMeta | null > =>
			ipcRenderer.invoke( IpcChannels.chatCreate, {
				projectId,
				title: options.title,
				draftRelPath: options.draftRelPath,
			} ),
		ensureForDraft: (
			projectId: string,
			draftRelPath: string
		): Promise< ChatMeta > =>
			ipcRenderer.invoke( IpcChannels.chatEnsureForDraft, {
				projectId,
				draftRelPath,
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
		listForDraft: (
			projectId: string,
			draftRelPath: string
		): Promise< ChatMeta[] > =>
			ipcRenderer.invoke( IpcChannels.chatsListForDraft, {
				projectId,
				draftRelPath,
			} ),
		recent: (): Promise< RecentChat[] > =>
			ipcRenderer.invoke( IpcChannels.chatsRecent ),
	},
	done: {
		listAll: (): Promise< Draft[] > =>
			ipcRenderer.invoke( IpcChannels.doneListAll ),
		listProject: ( projectId: string ): Promise< Draft[] > =>
			ipcRenderer.invoke( IpcChannels.doneListProject, { projectId } ),
	},
	drafts: {
		create: (
			projectId: string
		): Promise<
			| { ok: true; relPath: string; title: string }
			| { ok: false; reason: 'not-found' | 'io-error' }
		> =>
			ipcRenderer.invoke( IpcChannels.draftsCreate, {
				projectId,
			} ),
		export: (
			relPath: string,
			body: string
		): Promise<
			| { status: 'saved'; filePath: string }
			| { status: 'cancelled' }
			| { status: 'error'; reason: 'io-error' }
		> =>
			ipcRenderer.invoke( IpcChannels.draftsExport, {
				relPath,
				body,
			} ),
		listAll: (): Promise< Draft[] > =>
			ipcRenderer.invoke( IpcChannels.draftsListAll ),
		listProject: ( projectId: string ): Promise< Draft[] > =>
			ipcRenderer.invoke( IpcChannels.draftsListProject, { projectId } ),
		markDone: (
			projectId: string,
			relPath: string
		): Promise<
			| { ok: true; relPath: string }
			| { ok: false; reason: 'not-found' | 'collision' | 'io-error' }
		> =>
			ipcRenderer.invoke( IpcChannels.draftsMarkDone, {
				projectId,
				relPath,
			} ),
		read: (
			projectId: string,
			relPath: string,
			opts: { folder?: 'drafts' | 'done' } = {}
		): Promise< {
			title: string;
			body: string;
			frontmatter: Record< string, unknown >;
			mtime: number;
		} | null > =>
			ipcRenderer.invoke( IpcChannels.draftsRead, {
				projectId,
				relPath,
				folder: opts.folder ?? 'drafts',
			} ),
		write: (
			projectId: string,
			relPath: string,
			payload: {
				title: string;
				body: string;
				frontmatter: Record< string, unknown >;
				expectedMtime: number | null;
				folder?: 'drafts' | 'done';
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
				folder: payload.folder ?? 'drafts',
			} ),
		rename: (
			projectId: string,
			relPath: string,
			desired: string,
			opts: { markManual: boolean; folder?: 'drafts' | 'done' }
		): Promise<
			| { ok: true; relPath: string; mtime: number }
			| {
					ok: false;
					reason:
						| 'not-found'
						| 'invalid-name'
						| 'collision'
						| 'io-error';
			  }
		> =>
			ipcRenderer.invoke( IpcChannels.draftsRename, {
				projectId,
				relPath,
				desired,
				markManual: opts.markManual,
				folder: opts.folder ?? 'drafts',
			} ),
		saveImage: (
			projectId: string,
			payload: {
				mimeType: string;
				dataB64: string;
				originalFilename?: string;
			}
		): Promise<
			| { ok: true; relPath: string }
			| {
					ok: false;
					reason: 'mime' | 'too-large' | 'not-found' | 'io-error';
			  }
		> =>
			ipcRenderer.invoke( IpcChannels.draftsSaveImage, {
				projectId,
				...payload,
			} ),
		pickImage: (
			projectId: string
		): Promise<
			| { ok: true; relPath: string; fileName: string }
			| {
					ok: false;
					reason:
						| 'canceled'
						| 'mime'
						| 'too-large'
						| 'not-found'
						| 'io-error';
			  }
		> => ipcRenderer.invoke( IpcChannels.draftsPickImage, { projectId } ),
		watch: (
			projectId: string,
			relPath: string,
			opts: { folder?: 'drafts' | 'done' } = {}
		): Promise< { ok: true } | { ok: false; reason: 'not-found' } > =>
			ipcRenderer.invoke( IpcChannels.draftsWatch, {
				projectId,
				relPath,
				folder: opts.folder ?? 'drafts',
			} ),
		unwatch: (): Promise< { ok: true } > =>
			ipcRenderer.invoke( IpcChannels.draftsUnwatch, {} ),
		onFileChanged: (
			cb: ( event: DraftFileChanged ) => void
		): ( () => void ) => {
			const listener = (
				_: Electron.IpcRendererEvent,
				event: DraftFileChanged
			): void => cb( event );
			ipcRenderer.on( IpcChannels.draftsOnFileChanged, listener );
			return () =>
				ipcRenderer.off( IpcChannels.draftsOnFileChanged, listener );
		},
	},
	import: {
		resolveUrl: (
			url: string,
			projectId: string
		): Promise< ResolvedUrlImport | null > =>
			ipcRenderer.invoke( IpcChannels.importResolveUrl, {
				url,
				projectId,
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
		statFile: (
			projectId: string,
			subPath: string
		): Promise< { mtime: number } | null > =>
			ipcRenderer.invoke( IpcChannels.projectStatFile, {
				projectId,
				subPath,
			} ),
		uiPrefs: {
			get: ( projectId: string ): Promise< ProjectUiPrefs > =>
				ipcRenderer.invoke( IpcChannels.projectUiPrefsGet, {
					projectId,
				} ),
			set: (
				projectId: string,
				patch: {
					resourcesCollapsed?: ProjectUiPrefs[ 'resourcesCollapsed' ];
					resourcesSort?: ProjectUiPrefs[ 'resourcesSort' ];
					resourcesShow?: Partial<
						ProjectUiPrefs[ 'resourcesShow' ]
					>;
				}
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
		get: ( name: PromptName, projectId: string ): Promise< string > =>
			ipcRenderer.invoke( IpcChannels.promptGet, {
				name,
				projectId,
			} ),
	},
	resources: {
		delete: (
			projectId: string,
			folder: 'sources' | 'drafts' | 'done',
			relPath: string
		): Promise<
			{ ok: true } | { ok: false; reason: 'not-found' | 'io-error' }
		> =>
			ipcRenderer.invoke( IpcChannels.resourcesDelete, {
				projectId,
				folder,
				relPath,
			} ),
		saveThumb: (
			projectId: string,
			folder: string,
			relPath: string,
			mtime: number,
			dataB64: string
		): Promise<
			| { ok: true; thumbPath: string }
			| {
					ok: false;
					reason: 'not-found' | 'io-error' | 'too-large';
			  }
		> =>
			ipcRenderer.invoke( IpcChannels.resourcesSaveThumb, {
				projectId,
				folder,
				relPath,
				mtime,
				dataB64,
			} ),
		markThumbFailed: (
			projectId: string,
			folder: string,
			relPath: string,
			mtime: number
		): Promise<
			{ ok: true } | { ok: false; reason: 'not-found' | 'io-error' }
		> =>
			ipcRenderer.invoke( IpcChannels.resourcesMarkThumbFailed, {
				projectId,
				folder,
				relPath,
				mtime,
			} ),
	},
	settings: {
		get: (): Promise< Settings > =>
			ipcRenderer.invoke( IpcChannels.settingsGet ),
		set: ( patch: Settings ): Promise< Settings > =>
			ipcRenderer.invoke( IpcChannels.settingsSet, patch ),
	},
	shell: {
		openExternal: (
			url: string
		): Promise<
			{ ok: true } | { ok: false; reason: 'invalid-url' | 'open-failed' }
		> => ipcRenderer.invoke( IpcChannels.shellOpenExternal, { url } ),
	},
	uiPrefs: {
		get: (): Promise< UiPrefs > =>
			ipcRenderer.invoke( IpcChannels.uiPrefsGet ),
		set: ( patch: Partial< UiPrefs > ): Promise< UiPrefs > =>
			ipcRenderer.invoke( IpcChannels.uiPrefsSet, patch ),
	},
	window: {
		onFullscreenChange: (
			cb: ( isFullscreen: boolean ) => void
		): ( () => void ) => {
			const listener = (
				_: Electron.IpcRendererEvent,
				isFullscreen: boolean
			): void => cb( isFullscreen );
			ipcRenderer.on( IpcChannels.windowFullscreen, listener );
			return () =>
				ipcRenderer.off( IpcChannels.windowFullscreen, listener );
		},
	},
};

contextBridge.exposeInMainWorld( 'api', api );

export type Api = typeof api;
