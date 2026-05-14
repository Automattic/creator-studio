import { contextBridge, ipcRenderer, webUtils } from 'electron';

import { IpcChannels } from '../main/channels';
import type {
	AgentEvent,
	ChatMeta,
	ClaudeAuthStatus,
	DirEntry,
	Draft,
	DraftAttachment,
	DraftCheckKind,
	DraftCheckResult,
	MessageSelection,
	NoteFileChanged,
	PersistedMessage,
	Project,
	ProjectCreateNewResult,
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
	auth: {
		status: (): Promise< ClaudeAuthStatus > =>
			ipcRenderer.invoke( IpcChannels.authStatus ),
		refresh: (): Promise< ClaudeAuthStatus > =>
			ipcRenderer.invoke( IpcChannels.authStatusRefresh ),
		startLogin: (): Promise< { ok: true } > =>
			ipcRenderer.invoke( IpcChannels.authStartLogin ),
		logout: (): Promise< ClaudeAuthStatus > =>
			ipcRenderer.invoke( IpcChannels.authLogout ),
	},
	chat: {
		create: (
			projectId: string,
			options: { title?: string } = {}
		): Promise< ChatMeta | null > =>
			ipcRenderer.invoke( IpcChannels.chatCreate, {
				projectId,
				title: options.title,
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
	done: {
		listAll: (): Promise< Draft[] > =>
			ipcRenderer.invoke( IpcChannels.doneListAll ),
		listProject: ( projectId: string ): Promise< Draft[] > =>
			ipcRenderer.invoke( IpcChannels.doneListProject, { projectId } ),
	},
	drafts: {
		check: (
			projectId: string,
			body: string,
			checks: DraftCheckKind[]
		): Promise< DraftCheckResult[] > =>
			ipcRenderer.invoke( IpcChannels.draftsCheck, {
				projectId,
				body,
				checks,
			} ),
		create: (
			projectId: string
		): Promise<
			| { ok: true; relPath: string; title: string }
			| { ok: false; reason: 'not-found' | 'io-error' }
		> =>
			ipcRenderer.invoke( IpcChannels.notesCreate, {
				projectId,
				folder: 'drafts',
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
			ipcRenderer.invoke( IpcChannels.notesRead, {
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
			ipcRenderer.invoke( IpcChannels.notesWrite, {
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
			ipcRenderer.invoke( IpcChannels.notesRename, {
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
			ipcRenderer.invoke( IpcChannels.notesWatch, {
				projectId,
				relPath,
				folder: opts.folder ?? 'drafts',
			} ),
		unwatch: (): Promise< { ok: true } > =>
			ipcRenderer.invoke( IpcChannels.notesUnwatch, {} ),
		onFileChanged: (
			cb: ( event: NoteFileChanged ) => void
		): ( () => void ) => {
			const listener = (
				_: Electron.IpcRendererEvent,
				event: NoteFileChanged
			): void => cb( event );
			ipcRenderer.on( IpcChannels.notesOnFileChanged, listener );
			return () =>
				ipcRenderer.off( IpcChannels.notesOnFileChanged, listener );
		},
	},
	import: {
		resolveUrl: (
			url: string,
			projectId: string,
			subPath = 'sources'
		): Promise< ResolvedUrlImport | null > =>
			ipcRenderer.invoke( IpcChannels.importResolveUrl, {
				url,
				projectId,
				subPath,
			} ),
	},
	project: {
		create: ( input: {
			path: string;
			name: string;
			goal?: string;
		} ): Promise< Project > =>
			ipcRenderer.invoke( IpcChannels.projectCreate, input ),
		createFolder: (
			projectId: string,
			parentSubPath: string,
			name: string
		): Promise<
			| { ok: true; relPath: string }
			| {
					ok: false;
					reason:
						| 'not-found'
						| 'invalid-name'
						| 'collision'
						| 'io-error';
			  }
		> =>
			ipcRenderer.invoke( IpcChannels.projectCreateFolder, {
				projectId,
				parentSubPath,
				name,
			} ),
		createNew: ( input: {
			name: string;
			goal?: string;
			parentDir?: string;
		} ): Promise< ProjectCreateNewResult > =>
			ipcRenderer.invoke( IpcChannels.projectCreateNew, input ),
		defaultParentDir: (): Promise< string > =>
			ipcRenderer.invoke( IpcChannels.projectDefaultParentDir ),
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
		): Promise< {
			text: string;
			mtime: number | null;
			tooLarge: boolean;
		} | null > =>
			ipcRenderer.invoke( IpcChannels.projectReadFile, {
				projectId,
				subPath,
			} ),
		writeFile: (
			projectId: string,
			folder: 'sources' | 'drafts' | 'done',
			relPath: string,
			payload: { contents: string; expectedMtime: number | null }
		): Promise<
			| { ok: true; mtime: number }
			| {
					ok: false;
					reason: 'not-found' | 'mtime-conflict' | 'io-error';
			  }
		> =>
			ipcRenderer.invoke( IpcChannels.projectWriteFile, {
				projectId,
				folder,
				relPath,
				...payload,
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
		onThumbReady: (
			cb: ( payload: { projectId: string } ) => void
		): ( () => void ) => {
			const listener = (
				_: Electron.IpcRendererEvent,
				payload: { projectId: string }
			): void => cb( payload );
			ipcRenderer.on( IpcChannels.resourcesThumbReady, listener );
			return () =>
				ipcRenderer.off( IpcChannels.resourcesThumbReady, listener );
		},
		move: (
			projectId: string,
			items: Array< {
				folder: 'sources' | 'drafts' | 'done';
				relPath: string;
				name: string;
				kind: 'file' | 'dir';
			} >,
			destFolder: 'sources' | 'drafts' | 'done',
			destSubPath: string
		): Promise< {
			results: Array<
				| { ok: true; oldRelPath: string; newRelPath: string }
				| {
						ok: false;
						oldRelPath: string;
						reason:
							| 'not-found'
							| 'invalid-path'
							| 'into-own-descendant'
							| 'collision'
							| 'io-error';
				  }
			>;
		} > =>
			ipcRenderer.invoke( IpcChannels.resourcesMove, {
				projectId,
				items,
				destFolder,
				destSubPath,
			} ),
	},
	settings: {
		get: (): Promise< Settings > =>
			ipcRenderer.invoke( IpcChannels.settingsGet ),
		set: ( patch: Partial< Settings > ): Promise< Settings > =>
			ipcRenderer.invoke( IpcChannels.settingsSet, patch ),
	},
	sources: {
		// `subPath` is the destination directory relative to the project
		// root. It must resolve inside `sources/`; defaults to the group root.
		createNote: (
			projectId: string,
			subPath = 'sources'
		): Promise<
			| { ok: true; relPath: string; title: string }
			| { ok: false; reason: 'not-found' | 'io-error' | 'invalid-path' }
		> =>
			ipcRenderer.invoke( IpcChannels.notesCreate, {
				projectId,
				folder: subPath,
			} ),
		importFile: (
			projectId: string,
			subPath = 'sources'
		): Promise<
			| { ok: true; relPath: string; fileName: string }
			| {
					ok: false;
					reason:
						| 'canceled'
						| 'not-found'
						| 'too-large'
						| 'io-error'
						| 'invalid-path';
			  }
		> =>
			ipcRenderer.invoke( IpcChannels.sourcesImportFile, {
				projectId,
				subPath,
			} ),
		importDroppedFiles: (
			projectId: string,
			subPath: string,
			paths: string[]
		): Promise< {
			results: Array<
				| {
						ok: true;
						absPath: string;
						relPath: string;
						fileName: string;
				  }
				| {
						ok: false;
						absPath: string;
						reason:
							| 'not-found'
							| 'is-directory'
							| 'too-large'
							| 'io-error'
							| 'invalid-path';
				  }
			>;
		} > =>
			ipcRenderer.invoke( IpcChannels.sourcesImportDroppedFiles, {
				projectId,
				subPath,
				paths,
			} ),
		read: (
			projectId: string,
			relPath: string
		): Promise< {
			title: string;
			body: string;
			frontmatter: Record< string, unknown >;
			mtime: number;
		} | null > =>
			ipcRenderer.invoke( IpcChannels.notesRead, {
				projectId,
				relPath,
				folder: 'sources',
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
			ipcRenderer.invoke( IpcChannels.notesWrite, {
				projectId,
				relPath,
				...payload,
				folder: 'sources',
			} ),
		rename: (
			projectId: string,
			relPath: string,
			desired: string,
			opts: { markManual: boolean }
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
			ipcRenderer.invoke( IpcChannels.notesRename, {
				projectId,
				relPath,
				desired,
				markManual: opts.markManual,
				folder: 'sources',
			} ),
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

// Electron's modern way to recover an OS path from a `File` object pulled out
// of a drag-drop / file-input. The legacy `File.path` property was removed
// in Electron 32+; renderer code must call `webUtils.getPathForFile` instead.
contextBridge.exposeInMainWorld( 'electron', {
	webUtils: {
		getPathForFile: ( file: File ): string =>
			webUtils.getPathForFile( file ),
	},
} );

export type Api = typeof api;
