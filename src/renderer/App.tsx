import React, { useEffect, useRef, useState } from 'react';

import type {
	ChatMeta,
	DraftAttachment,
	MessageSelection,
	Project,
	ResourcesViewState,
} from '../types';

import { Sidebar, type RecentDraft, type View } from './components/Sidebar';
import { TopActions } from './components/TopActions';
import { type PermissionRequest } from './components/PermissionPrompt';
import { ResourcesPanelToggleIcon } from './icons';
import { DraftEditorScreen } from './screens/DraftEditorScreen';
import { DraftsAndDoneScreen } from './screens/DraftsAndDoneScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import {
	ProjectScreen,
	type AssistantMessage,
	type Message,
	type UserMessage,
} from './screens/ProjectScreen';
import { CreateProjectModal } from './components/CreateProjectModal';
import { ImportUrlModal } from './components/ImportUrlModal';
import { SearchModal } from './components/SearchModal';
import { SettingsModal } from './components/SettingsModal';
import { isPreviewable } from './lib/previewKind';

function chatKey( projectId: string, chatId: string ): string {
	return `${ projectId }:${ chatId }`;
}

function pickDefaultChatId( chats: ChatMeta[] ): string | null {
	if ( chats.length === 0 ) {
		return null;
	}
	const sorted = [ ...chats ].sort( ( a, b ) => {
		const aAt = a.lastMessageAt ?? a.createdAt;
		const bAt = b.lastMessageAt ?? b.createdAt;
		return bAt - aAt;
	} );
	return sorted[ 0 ].id;
}

let counter = 0;
const nextId = (): string => `m${ ++counter }`;

const defaultResourcesView: ResourcesViewState = {
	query: '',
	drill: null,
	scrollTop: 0,
};

export function App(): React.ReactElement {
	const [ messagesByChat, setMessagesByChat ] = useState<
		Record< string, Message[] >
	>( {} );
	const [ chatsByProject, setChatsByProject ] = useState<
		Record< string, ChatMeta[] >
	>( {} );
	const [ activeChatIdByProject, setActiveChatIdByProject ] = useState<
		Record< string, string >
	>( {} );
	const [ closedChatIdsByProject, setClosedChatIdsByProject ] = useState<
		Record< string, string[] >
	>( {} );
	const [ busyChats, setBusyChats ] = useState< Record< string, boolean > >(
		{}
	);
	const [ permissions, setPermissions ] = useState< PermissionRequest[] >(
		[]
	);
	const [ previewedFileByProject, setPreviewedFileByProject ] = useState<
		Record<
			string,
			{
				folder: 'sources' | 'drafts' | 'done';
				relPath: string;
				name: string;
			}
		>
	>( {} );
	// Search query, folder drill path, and scroll position of the resources
	// panel, kept per project so the preview round-trip (open file → click
	// Back) returns the user to the same view they left.
	const [ resourcesViewByProject, setResourcesViewByProject ] = useState<
		Record< string, ResourcesViewState >
	>( {} );
	const [ sidebarOpen, setSidebarOpen ] = useState( true );
	const [ resourcesOpen, setResourcesOpen ] = useState( true );
	const [ isFullscreen, setIsFullscreen ] = useState( false );
	const [ projects, setProjects ] = useState< Project[] >( [] );
	const [ activeProjectId, setActiveProjectId ] = useState< string | null >(
		null
	);
	const [ activeView, setActiveView ] = useState< View >( 'projects' );
	const [ editingDraft, setEditingDraft ] = useState< {
		projectId: string;
		relPath: string;
		title: string;
		folder: 'drafts' | 'done';
	} | null >( null );
	const [ createProjectOpen, setCreateProjectOpen ] = useState( false );
	const [ importUrlOpen, setImportUrlOpen ] = useState( false );
	const [ searchOpen, setSearchOpen ] = useState( false );
	const [ settingsOpen, setSettingsOpen ] = useState( false );
	const [ recents, setRecents ] = useState< RecentDraft[] >( [] );

	const refreshRecent = (): void => {
		void window.api.drafts.listAll().then( ( drafts ) => {
			setRecents(
				drafts.slice( 0, 6 ).map(
					( d ): RecentDraft => ( {
						projectId: d.projectId,
						projectName: d.projectName,
						relPath: d.relPath,
						title: d.title,
						mtime: d.mtime,
					} )
				)
			);
		} );
	};

	const handleSelectProject = ( id: string ): void => {
		setActiveProjectId( id );
		setActiveView( 'project' );
	};

	const handleOpenDraftEditor = ( draft: {
		projectId: string;
		relPath: string;
		title: string;
		folder?: 'drafts' | 'done';
	} ): void => {
		setEditingDraft( {
			projectId: draft.projectId,
			relPath: draft.relPath,
			title: draft.title,
			folder: draft.folder ?? 'drafts',
		} );
		setActiveView( 'draft-editor' );
	};

	const handleBackFromDraftEditor = (): void => {
		const projectId = editingDraft?.projectId ?? null;
		const folder = editingDraft?.folder ?? 'drafts';
		setEditingDraft( null );
		if ( projectId && folder === 'drafts' ) {
			setActiveProjectId( projectId );
			setActiveView( 'project' );
		} else if ( folder === 'done' ) {
			setActiveView( 'done' );
		} else {
			setActiveView( 'drafts' );
		}
		refreshRecent();
	};

	const handleViewAllDrafts = (): void => {
		setActiveView( 'drafts' );
	};

	const handleProjectCreated = ( project: Project ): void => {
		setProjects( ( prev ) =>
			prev.some( ( p ) => p.id === project.id )
				? prev
				: [ ...prev, project ]
		);
		setActiveProjectId( project.id );
		setActiveView( 'project' );
	};

	const activeChatId = activeProjectId
		? activeChatIdByProject[ activeProjectId ] ?? null
		: null;
	const activeKey =
		activeProjectId && activeChatId
			? chatKey( activeProjectId, activeChatId )
			: null;
	const messages = activeKey ? messagesByChat[ activeKey ] ?? [] : [];
	const activeProjectChats = activeProjectId
		? chatsByProject[ activeProjectId ] ?? []
		: [];

	const toggleSidebar = (): void => setSidebarOpen( ( v ) => ! v );
	const toggleResources = (): void =>
		setResourcesOpen( ( v ) => {
			const next = ! v;
			void window.api.uiPrefs.set( { resourcesPanelOpen: next } );
			return next;
		} );

	useEffect( () => {
		const handler = ( e: KeyboardEvent ): void => {
			if ( ! ( e.metaKey || e.ctrlKey ) ) {
				return;
			}
			if ( e.key === 'b' ) {
				e.preventDefault();
				toggleSidebar();
			} else if ( e.key === 'r' ) {
				e.preventDefault();
				toggleResources();
			}
		};
		window.addEventListener( 'keydown', handler );
		return () => window.removeEventListener( 'keydown', handler );
	}, [] );

	useEffect( () => {
		return window.api.window.onFullscreenChange( setIsFullscreen );
	}, [] );

	const [ prefsHydrated, setPrefsHydrated ] = useState( false );
	useEffect( () => {
		void window.api.uiPrefs.get().then( ( prefs ) => {
			setResourcesOpen( prefs.resourcesPanelOpen );
			setClosedChatIdsByProject( prefs.closedChatIdsByProject );
			setPrefsHydrated( true );
		} );
	}, [] );

	// Persist whenever the user closes/reopens/deletes a chat. Skip the
	// initial render so we don't overwrite the on-disk value with the empty
	// default before hydration lands.
	useEffect( () => {
		if ( ! prefsHydrated ) {
			return;
		}
		void window.api.uiPrefs.set( {
			closedChatIdsByProject,
		} );
	}, [ closedChatIdsByProject, prefsHydrated ] );

	// The chat-list hydration needs the latest closed list when picking a
	// default active chat, but we don't want it as a useEffect dep — it would
	// re-run every time the user closes a tab. A ref kept in sync each render
	// gives us read-on-demand without re-triggering the effect.
	const closedChatIdsByProjectRef = useRef( closedChatIdsByProject );
	closedChatIdsByProjectRef.current = closedChatIdsByProject;

	// Dev-only verification surface. An agent (or Playwright script) driving
	// the app can poll these instead of snapshotting the whole DOM after
	// every step — one cheap DOM read per call. Gate on the dev protocol so
	// packaged builds (loaded via file://) never expose it.
	useEffect( () => {
		if ( location.protocol !== 'http:' ) {
			return;
		}
		const api = {
			isStreaming: (): boolean =>
				document.querySelector(
					'[data-testid=bubble-assistant][data-streaming="true"]'
				) !== null,
			hasPendingPermission: (): boolean =>
				document.querySelector( '[data-testid=permission-prompt]' ) !==
				null,
			isIdle: (): boolean =>
				document.querySelector(
					'[data-testid=bubble-assistant][data-streaming="true"]'
				) === null &&
				document.querySelector( '[data-testid=permission-prompt]' ) ===
					null,
		};
		( window as unknown as { __sw: typeof api } ).__sw = api;
		return () => {
			delete ( window as unknown as { __sw?: typeof api } ).__sw;
		};
	}, [] );

	useEffect( () => {
		void window.api.projects.list().then( ( list ) => {
			setProjects( list );
			setActiveProjectId( ( prev ) => prev ?? list[ 0 ]?.id ?? null );
			// If there's a project to auto-enter, land the user in the
			// project screen — only when still on the initial Projects
			// default, so a manual navigation during the first tick isn't
			// clobbered.
			if ( list.length > 0 ) {
				setActiveView( ( prev ) =>
					prev === 'projects' ? 'project' : prev
				);
			}
		} );
		refreshRecent();
	}, [] );

	// Hydrate the project's chat list on first activation in this session.
	// If the project has zero chats, auto-create one so the composer stays
	// immediately usable. Gated on prefsHydrated so the closed-chat list is
	// known by the time we pick a default active chat — otherwise a project
	// where every chat was previously closed would land on a hidden chat
	// with the composer enabled.
	const fetchedChatListsRef = useRef( new Set< string >() );
	useEffect( () => {
		if ( ! prefsHydrated ) {
			return;
		}
		if ( ! activeProjectId ) {
			return;
		}
		if ( fetchedChatListsRef.current.has( activeProjectId ) ) {
			return;
		}
		fetchedChatListsRef.current.add( activeProjectId );
		const projectId = activeProjectId;
		void ( async () => {
			let chats = await window.api.chats.list( projectId );
			if ( chats.length === 0 ) {
				const created = await window.api.chat.create( projectId );
				if ( created ) {
					chats = [ created ];
				}
			}
			setChatsByProject( ( prev ) => ( {
				...prev,
				[ projectId ]: chats,
			} ) );
			setActiveChatIdByProject( ( prev ) => {
				if ( prev[ projectId ] ) {
					return prev;
				}
				const closed = new Set(
					closedChatIdsByProjectRef.current[ projectId ] ?? []
				);
				const open = chats.filter( ( c ) => ! closed.has( c.id ) );
				const pick = pickDefaultChatId( open );
				if ( ! pick ) {
					return prev;
				}
				return { ...prev, [ projectId ]: pick };
			} );
		} )();
	}, [ activeProjectId, prefsHydrated ] );

	// Hydrate a chat's transcript from disk the first time it becomes active.
	useEffect( () => {
		if ( ! activeProjectId || ! activeChatId ) {
			return;
		}
		const key = chatKey( activeProjectId, activeChatId );
		if ( messagesByChat[ key ] !== undefined ) {
			return;
		}
		void window.api.chat
			.load( activeProjectId, activeChatId )
			.then( ( persisted ) => {
				const restored: Message[] = persisted.map( ( p ) => {
					if ( p.kind === 'user' ) {
						return {
							kind: 'user',
							id: p.id,
							text: p.text,
							attachments: p.attachments,
							selections: p.selections,
						};
					}
					if ( p.kind === 'assistant' ) {
						return {
							kind: 'assistant',
							id: p.id,
							text: p.text,
							streaming: false,
							errored: p.errored,
							cancelled: p.cancelled,
						};
					}
					return {
						kind: 'tool',
						id: p.id,
						toolUseId: p.toolUseId,
						toolName: p.toolName,
						input: p.input,
						status: p.status,
						output: p.output,
					};
				} );
				setMessagesByChat( ( prev ) =>
					prev[ key ] === undefined
						? { ...prev, [ key ]: restored }
						: prev
				);
			} );
	}, [ activeProjectId, activeChatId, messagesByChat ] );

	// Each in-flight send tracks the assistant message id receiving the
	// stream, keyed by chatKey. Events carry chatId so multiple chats can
	// stream side by side without clobbering each other's bubbles.
	const streamsByChatRef = useRef< Record< string, { msgId: string } > >(
		{}
	);

	const updateChatMessages = (
		projectId: string,
		chatId: string,
		updater: ( list: Message[] ) => Message[]
	): void => {
		const key = chatKey( projectId, chatId );
		setMessagesByChat( ( prev ) => ( {
			...prev,
			[ key ]: updater( prev[ key ] ?? [] ),
		} ) );
	};

	useEffect( () => {
		const off = window.api.agent.onEvent( ( event ) => {
			const projectId = event.projectId;
			const chatId = event.chatId;
			const key = chatKey( projectId, chatId );
			const stream = streamsByChatRef.current[ key ];
			switch ( event.kind ) {
				case 'text-delta': {
					if ( ! stream ) {
						return;
					}
					updateChatMessages( projectId, chatId, ( list ) =>
						list.map( ( m ) =>
							m.kind === 'assistant' && m.id === stream.msgId
								? { ...m, text: m.text + event.text }
								: m
						)
					);
					return;
				}
				case 'tool-use-start':
					if ( ! stream ) {
						return;
					}
					updateChatMessages( projectId, chatId, ( list ) => [
						...list,
						{
							kind: 'tool',
							id: nextId(),
							toolUseId: event.toolUseId,
							toolName: event.toolName,
							input: event.input,
							status: 'running',
						},
					] );
					return;
				case 'tool-result':
					if ( ! stream ) {
						return;
					}
					updateChatMessages( projectId, chatId, ( list ) =>
						list.map( ( m ) =>
							m.kind === 'tool' && m.toolUseId === event.toolUseId
								? {
										...m,
										status: event.isError
											? 'error'
											: 'done',
										output: event.output,
								  }
								: m
						)
					);
					return;
				case 'permission-request':
					setPermissions( ( prev ) => [
						...prev,
						{
							requestId: event.requestId,
							projectId: event.projectId,
							chatId: event.chatId,
							toolName: event.toolName,
							input: event.input,
						},
					] );
					return;
				case 'done': {
					delete streamsByChatRef.current[ key ];
					setBusyChats( ( prev ) => {
						if ( ! prev[ key ] ) {
							return prev;
						}
						const next = { ...prev };
						delete next[ key ];
						return next;
					} );
					refreshRecent();
					if ( ! stream ) {
						return;
					}
					updateChatMessages( projectId, chatId, ( list ) =>
						list.map( ( m ) =>
							m.kind === 'assistant' && m.id === stream.msgId
								? {
										...m,
										streaming: false,
										cancelled:
											event.cancelled || m.cancelled,
								  }
								: m
						)
					);
					return;
				}
				case 'chat-title': {
					setChatsByProject( ( prev ) => {
						const list = prev[ projectId ] ?? [];
						if ( ! list.some( ( c ) => c.id === event.chatId ) ) {
							return prev;
						}
						return {
							...prev,
							[ projectId ]: list.map( ( c ) =>
								c.id === event.chatId
									? { ...c, title: event.title }
									: c
							),
						};
					} );
					refreshRecent();
					return;
				}
				case 'error': {
					if ( ! stream ) {
						return;
					}
					const action =
						event.code === 'invalid_api_key'
							? 'open-settings'
							: undefined;
					updateChatMessages( projectId, chatId, ( list ) =>
						list.map( ( m ) =>
							m.kind === 'assistant' && m.id === stream.msgId
								? {
										...m,
										text:
											m.text +
											( m.text ? '\n\n' : '' ) +
											`Error: ${ event.message }`,
										errored: true,
										errorAction: action ?? m.errorAction,
								  }
								: m
						)
					);
				}
			}
		} );
		return off;
	}, [] );

	const onDecision = (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	): void => {
		const target = permissions.find( ( p ) => p.requestId === requestId );
		setPermissions( ( prev ) =>
			prev.filter( ( p ) => p.requestId !== requestId )
		);
		if ( target ) {
			void window.api.agent.respondPermission(
				requestId,
				target.projectId,
				decision,
				remember
			);
		}
	};

	const sendMessage = async (
		text: string,
		projectId: string,
		chatId: string,
		opts: {
			userMessageText?: string;
			attachments?: DraftAttachment[];
			selections?: MessageSelection[];
		} = {}
	): Promise< void > => {
		const key = chatKey( projectId, chatId );
		const userMsg: UserMessage = {
			kind: 'user',
			id: nextId(),
			text: opts.userMessageText ?? text,
			attachments: opts.attachments,
			selections: opts.selections,
		};
		const assistantMsg: AssistantMessage = {
			kind: 'assistant',
			id: nextId(),
			text: '',
			streaming: true,
		};
		streamsByChatRef.current[ key ] = { msgId: assistantMsg.id };
		updateChatMessages( projectId, chatId, ( list ) => [
			...list,
			userMsg,
			assistantMsg,
		] );
		setBusyChats( ( prev ) => ( { ...prev, [ key ]: true } ) );
		try {
			await window.api.agent.send( text, projectId, chatId, {
				userMessageText: opts.userMessageText,
				attachments: opts.attachments,
				selections: opts.selections,
			} );
		} catch ( err ) {
			const message = err instanceof Error ? err.message : String( err );
			const stream = streamsByChatRef.current[ key ];
			delete streamsByChatRef.current[ key ];
			if ( stream ) {
				updateChatMessages( projectId, chatId, ( list ) =>
					list.map( ( m ) =>
						m.kind === 'assistant' && m.id === stream.msgId
							? {
									...m,
									text: `Error: ${ message }`,
									streaming: false,
									errored: true,
							  }
							: m
					)
				);
			}
			setBusyChats( ( prev ) => {
				if ( ! prev[ key ] ) {
					return prev;
				}
				const next = { ...prev };
				delete next[ key ];
				return next;
			} );
		}
	};

	const startImportUrlChat = async ( url: string ): Promise< void > => {
		if ( ! activeProjectId ) {
			throw new Error( 'Open a project before importing a URL.' );
		}
		const projectId = activeProjectId;
		const resolved = await window.api.import.resolveUrl( url, projectId );
		if ( ! resolved ) {
			throw new Error(
				"That doesn't look like a URL. Try something like https://example.com/article."
			);
		}
		const chat = await window.api.chat.create( projectId, {
			title: resolved.chatTitle,
		} );
		if ( ! chat ) {
			throw new Error( 'Could not create a chat for the import.' );
		}
		setChatsByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: [ ...( prev[ projectId ] ?? [] ), chat ],
		} ) );
		setActiveChatIdByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: chat.id,
		} ) );
		// Same reasoning as startStarterChat: seed the cache so the hydration
		// effect skips the (nonexistent) jsonl load.
		setMessagesByChat( ( prev ) => ( {
			...prev,
			[ chatKey( projectId, chat.id ) ]: [],
		} ) );
		await sendMessage( resolved.prompt.trim(), projectId, chat.id );
	};

	const stripExtension = ( name: string ): string => {
		const dot = name.lastIndexOf( '.' );
		return dot > 0 ? name.slice( 0, dot ) : name;
	};

	const handlePreviewFile = (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	): void => {
		if ( ! activeProjectId ) {
			return;
		}
		// Bubble cards and composer chips also call through this path with
		// arbitrary file names, so the gate stays here rather than at every
		// call site.
		if ( ! isPreviewable( name ) ) {
			return;
		}
		setPreviewedFileByProject( ( prev ) => ( {
			...prev,
			[ activeProjectId ]: { folder, relPath, name },
		} ) );
	};

	const handleOpenNewChat = async (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string
	): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const project = projects.find( ( p ) => p.id === projectId );
		if ( ! project ) {
			return;
		}
		// Pin the resources panel to the new chat's source file when there's
		// something to render — markdown and images today.
		if ( isPreviewable( name ) ) {
			setPreviewedFileByProject( ( prev ) => ( {
				...prev,
				[ projectId ]: { folder, relPath, name },
			} ) );
		}

		const chat = await window.api.chat.create( projectId, {
			title: stripExtension( name ),
		} );
		if ( ! chat ) {
			return;
		}
		setChatsByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: [ ...( prev[ projectId ] ?? [] ), chat ],
		} ) );
		setActiveChatIdByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: chat.id,
		} ) );
		setMessagesByChat( ( prev ) => ( {
			...prev,
			[ chatKey( projectId, chat.id ) ]: [],
		} ) );
	};

	const handleNewDraft = async (): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const result = await window.api.drafts.create( projectId );
		if ( ! result.ok ) {
			return;
		}
		handleOpenDraftEditor( {
			projectId,
			relPath: result.relPath,
			title: result.title,
		} );
		refreshRecent();
	};

	const handleClosePreview = (): void => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		setPreviewedFileByProject( ( prev ) => {
			if ( ! ( projectId in prev ) ) {
				return prev;
			}
			const next = { ...prev };
			delete next[ projectId ];
			return next;
		} );
	};

	const handleResourceDeleted = (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string
	): void => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		// Clear the preview if it was pointing at the file we just deleted, so
		// the resources panel doesn't try to render a missing file.
		setPreviewedFileByProject( ( prev ) => {
			const current = prev[ projectId ];
			if (
				! current ||
				current.folder !== folder ||
				current.relPath !== relPath
			) {
				return prev;
			}
			const next = { ...prev };
			delete next[ projectId ];
			return next;
		} );
		// Bail out of the editor too — same reason. The editor only opens
		// drafts, so non-draft deletions don't need to touch this.
		if ( folder === 'drafts' ) {
			setEditingDraft( ( prev ) =>
				prev && prev.projectId === projectId && prev.relPath === relPath
					? null
					: prev
			);
			refreshRecent();
		}
	};

	const onNewChat = async (): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const created = await window.api.chat.create( projectId );
		if ( ! created ) {
			return;
		}
		setChatsByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: [ ...( prev[ projectId ] ?? [] ), created ],
		} ) );
		setActiveChatIdByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: created.id,
		} ) );
		setMessagesByChat( ( prev ) => ( {
			...prev,
			[ chatKey( projectId, created.id ) ]: [],
		} ) );
	};

	const onSelectChat = ( chatId: string ): void => {
		if ( ! activeProjectId ) {
			return;
		}
		setActiveChatIdByProject( ( prev ) => ( {
			...prev,
			[ activeProjectId ]: chatId,
		} ) );
	};

	const onDeleteChat = async ( chatId: string ): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const allChats = chatsByProject[ projectId ] ?? [];
		const remaining = allChats.filter( ( c ) => c.id !== chatId );
		const wasActive = activeChatIdByProject[ projectId ] === chatId;
		await window.api.chat.remove( projectId, chatId );
		setChatsByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: ( prev[ projectId ] ?? [] ).filter(
				( c ) => c.id !== chatId
			),
		} ) );
		setClosedChatIdsByProject( ( prev ) => {
			const list = prev[ projectId ] ?? [];
			if ( ! list.includes( chatId ) ) {
				return prev;
			}
			return {
				...prev,
				[ projectId ]: list.filter( ( id ) => id !== chatId ),
			};
		} );
		setMessagesByChat( ( prev ) => {
			const key = chatKey( projectId, chatId );
			if ( ! ( key in prev ) ) {
				return prev;
			}
			const next = { ...prev };
			delete next[ key ];
			return next;
		} );
		if ( wasActive ) {
			const stillClosed = closedChatIdsByProject[ projectId ] ?? [];
			const stillVisible = remaining.filter(
				( c ) => ! stillClosed.includes( c.id )
			);
			const next = pickDefaultChatId( stillVisible );
			setActiveChatIdByProject( ( prev ) => {
				const copy = { ...prev };
				if ( next ) {
					copy[ projectId ] = next;
				} else {
					delete copy[ projectId ];
				}
				return copy;
			} );
		}
		refreshRecent();
	};

	const activeBusy =
		activeKey !== null ? Boolean( busyChats[ activeKey ] ) : false;
	// Permission prompts are scoped to the chat that triggered them. Filtering
	// by project alone leaks a request into a sibling chat the user switched to.
	const activePermissions =
		activeProjectId && activeChatId
			? permissions.filter(
					( p ) =>
						p.projectId === activeProjectId &&
						p.chatId === activeChatId
			  )
			: [];
	const activePreviewedFile = activeProjectId
		? previewedFileByProject[ activeProjectId ] ?? null
		: null;

	const onCancelChat = ( chatId: string ): void => {
		if ( ! activeProjectId ) {
			return;
		}
		if ( ! busyChats[ chatKey( activeProjectId, chatId ) ] ) {
			return;
		}
		void window.api.agent.cancel( activeProjectId, chatId );
	};

	return (
		<div
			className="app"
			data-sidebar-open={ sidebarOpen ? 'true' : 'false' }
			data-fullscreen={ isFullscreen ? 'true' : 'false' }
		>
			<Sidebar
				isOpen={ sidebarOpen }
				onToggle={ toggleSidebar }
				onLinkProject={ () => setCreateProjectOpen( true ) }
				onSearch={ () => setSearchOpen( true ) }
				onOpenSettings={ () => setSettingsOpen( true ) }
				recents={ recents }
				activeProjectId={ activeProjectId }
				activeDraftRelPath={
					activeView === 'draft-editor'
						? editingDraft?.relPath ?? null
						: null
				}
				onSelectRecentDraft={ ( projectId, relPath, title ) =>
					handleOpenDraftEditor( { projectId, relPath, title } )
				}
				onViewAllDrafts={ handleViewAllDrafts }
				activeView={ activeView }
				onSelectView={ setActiveView }
			/>

			<CreateProjectModal
				open={ createProjectOpen }
				onClose={ () => setCreateProjectOpen( false ) }
				onCreated={ handleProjectCreated }
			/>

			<ImportUrlModal
				open={ importUrlOpen }
				onClose={ () => setImportUrlOpen( false ) }
				onSubmit={ startImportUrlChat }
			/>

			<SearchModal
				open={ searchOpen }
				onClose={ () => setSearchOpen( false ) }
				projects={ projects }
				onSelect={ handleSelectProject }
				onSelectDraft={ handleOpenDraftEditor }
			/>

			<SettingsModal
				open={ settingsOpen }
				onClose={ () => setSettingsOpen( false ) }
			/>

			<div className="main">
				<div className="main-top" data-testid="titlebar">
					{ ! sidebarOpen && (
						<TopActions
							onToggle={ toggleSidebar }
							onLinkProject={ () => setCreateProjectOpen( true ) }
							onSearch={ () => setSearchOpen( true ) }
							tabbable={ true }
							toggleLabel="Show sidebar"
							testIdPrefix="workspace"
						/>
					) }
					{ activeView === 'project' && (
						<>
							{ activePreviewedFile ? (
								<div
									id="resource-preview-titlebar-slot"
									className="main-top-resource-preview"
								/>
							) : (
								<div
									className="main-top-title-spacer"
									aria-hidden="true"
								/>
							) }
							<div
								className="main-top-actions"
								data-testid="transcript-actions"
							>
								<button
									type="button"
									className="sidebar-icon-btn"
									data-testid="resources-toggle"
									aria-label={
										resourcesOpen
											? 'Hide resources'
											: 'Show resources'
									}
									aria-pressed={ resourcesOpen }
									title={
										resourcesOpen
											? 'Hide resources (⌘R)'
											: 'Show resources (⌘R)'
									}
									onClick={ toggleResources }
								>
									<ResourcesPanelToggleIcon size={ 18 } />
								</button>
							</div>
						</>
					) }
					{ activeView === 'draft-editor' && (
						<div
							id="draft-editor-titlebar-slot"
							className="main-top-draft-editor"
						/>
					) }
				</div>
				<div className="workspace" data-testid="workspace">
					{ activeView === 'projects' && (
						<ProjectsScreen
							projects={ projects }
							onSelect={ handleSelectProject }
							onCreate={ () => setCreateProjectOpen( true ) }
						/>
					) }
					{ ( activeView === 'drafts' || activeView === 'done' ) && (
						<DraftsAndDoneScreen
							tab={ activeView }
							onSelectTab={ ( tab ) => setActiveView( tab ) }
							onSelectProject={ handleSelectProject }
							onOpenDraft={ handleOpenDraftEditor }
						/>
					) }
					{ activeView === 'draft-editor' && editingDraft && (
						<DraftEditorScreen
							projectId={ editingDraft.projectId }
							relPath={ editingDraft.relPath }
							title={ editingDraft.title }
							folder={ editingDraft.folder }
							onBack={ handleBackFromDraftEditor }
							onRelPathChanged={ ( newRelPath ) =>
								setEditingDraft( ( prev ) =>
									prev
										? { ...prev, relPath: newRelPath }
										: prev
								)
							}
							chats={ activeProjectChats }
							activeChatId={ activeChatId }
							messages={ messages }
							busy={ activeBusy }
							permissions={ activePermissions }
							onSelectChat={ onSelectChat }
							onNewChat={ () => {
								void onNewChat();
							} }
							onDeleteChat={ ( chatId ) => {
								void onDeleteChat( chatId );
							} }
							onSend={ ( prompt, opts ) => {
								if ( ! activeChatId || ! activeProjectId ) {
									return;
								}
								void sendMessage(
									prompt,
									activeProjectId,
									activeChatId,
									opts
								);
							} }
							onCancelChat={ () => {
								if ( ! activeChatId ) {
									return;
								}
								onCancelChat( activeChatId );
							} }
							onPermissionDecision={ onDecision }
						/>
					) }
					{ activeView === 'project' && (
						<ProjectScreen
							activeProjectId={ activeProjectId }
							resourcesOpen={ resourcesOpen }
							activeChatId={ activeChatId }
							chats={ activeProjectChats }
							messages={ messages }
							permissions={ activePermissions }
							busy={ activeBusy }
							previewedFile={ activePreviewedFile }
							onSelectChat={ onSelectChat }
							onCancelChat={ onCancelChat }
							onDeleteChat={ ( chatId ) => {
								void onDeleteChat( chatId );
							} }
							onNewChat={ () => {
								void onNewChat();
							} }
							onSend={ ( prompt, opts ) => {
								if ( ! activeChatId || ! activeProjectId ) {
									return;
								}
								void sendMessage(
									prompt,
									activeProjectId,
									activeChatId,
									opts
								);
							} }
							onPreviewFile={ handlePreviewFile }
							onAddToChat={ () => {} }
							onOpenNewChat={ ( folder, relPath, name ) => {
								void handleOpenNewChat( folder, relPath, name );
							} }
							onEditDraft={ ( relPath, name ) => {
								if ( ! activeProjectId ) {
									return;
								}
								const dot = name.lastIndexOf( '.' );
								const title =
									dot > 0 ? name.slice( 0, dot ) : name;
								handleOpenDraftEditor( {
									projectId: activeProjectId,
									relPath,
									title,
								} );
							} }
							onResourceDeleted={ handleResourceDeleted }
							onClosePreview={ handleClosePreview }
							onNewDraft={ () => {
								void handleNewDraft();
							} }
							onImportUrl={ () => setImportUrlOpen( true ) }
							resourcesView={
								activeProjectId
									? resourcesViewByProject[
											activeProjectId
									  ] ?? defaultResourcesView
									: defaultResourcesView
							}
							onResourcesViewChange={ ( patch ) => {
								if ( ! activeProjectId ) {
									return;
								}
								const projectId = activeProjectId;
								setResourcesViewByProject( ( prev ) => {
									const current =
										prev[ projectId ] ??
										defaultResourcesView;
									return {
										...prev,
										[ projectId ]: { ...current, ...patch },
									};
								} );
							} }
							onPermissionDecision={ onDecision }
						/>
					) }
				</div>
			</div>
		</div>
	);
}
