import React, { useCallback, useEffect, useRef, useState } from 'react';

import type {
	ChatMeta,
	CurrentView,
	DraftAttachment,
	DraftSidebarTab,
	MessageSelection,
	OpenResource,
	Project,
	ResourcesViewState,
	TaskDefinition,
	TaskRun,
} from '../types';

import { Sidebar, type RecentDraft, type View } from './components/Sidebar';
import { TopActions } from './components/TopActions';
import { type PermissionRequest } from './components/PermissionPrompt';
import { type AddedSelection } from './components/DraftChatPanel';
import { DraftEditorScreen } from './screens/DraftEditorScreen';
import { DraftsAndDoneScreen } from './screens/DraftsAndDoneScreen';
import { HomeScreen, type RecentProject } from './screens/HomeScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import {
	ProjectScreen,
	type AssistantMessage,
	type Message,
	type UserMessage,
} from './screens/ProjectScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TasksScreen } from './screens/TasksScreen';
import { TaskDetailScreen } from './screens/TaskDetailScreen';
import { NewProjectModal } from './components/NewProjectModal';
import { CreateTaskModal } from './components/CreateTaskModal';
import { DeleteTaskDialog } from './components/DeleteTaskDialog';
import { ImportFolderModal } from './components/ImportFolderModal';
import { ImportWordPressModal } from './components/ImportWordPressModal';
import { CreateFolderDialog } from './components/CreateFolderDialog';
import { RemoveProjectDialog } from './components/RemoveProjectDialog';
import { RenameProjectDialog } from './components/RenameProjectDialog';
import { UpdateGoalDialog } from './components/UpdateGoalDialog';
import { ImportUrlModal } from './components/ImportUrlModal';
import { SearchModal } from './components/SearchModal';
import { isMarkdown, isPreviewable } from './lib/previewKind';
import { persistedToMessages } from './lib/persistedToMessages';
import { withSelectionId } from './editor/useSelectionMenu';

const FILE_WRITING_TOOLS = new Set( [
	'Write',
	'Edit',
	'MultiEdit',
	'NotebookEdit',
	'Bash',
] );

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

// First user message dispatched when the resources panel ⋯ menu's
// voice action fires. The writing-assistant system prompt recognises
// either phrasing and runs the voice auto-creation/update flow. The
// verb matches the menu label so the chat reads naturally to the user.
function voiceTriggerPrompt( action: 'create' | 'update' ): string {
	return action === 'update'
		? 'Please help me update the writing voice for this project.'
		: 'Please help me create a writing voice for this project.';
}

const GROUP_LABEL: Record< string, string > = {
	sources: 'Sources',
	drafts: 'Drafts',
	done: 'Done',
};

function subPathToLabel( subPath: string ): string {
	const parts = subPath.split( '/' ).filter( ( s ) => s.length > 0 );
	if ( parts.length === 0 ) {
		return '';
	}
	const head = GROUP_LABEL[ parts[ 0 ] ] ?? parts[ 0 ];
	return [ head, ...parts.slice( 1 ) ].join( ' / ' );
}

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
				folder: 'sources' | 'drafts' | 'done' | 'checks';
				relPath: string;
				name: string;
			}
		>
	>( {} );
	// Pending context the user is staging into the next message for a given
	// chat. Keyed by `chatKey(projectId, chatId)` so it survives every screen
	// transition that doesn't change the active chat. Cleared after each send
	// to avoid wasting agent context on duplicate file contents.
	const [ pendingAttachmentsByChat, setPendingAttachmentsByChat ] = useState<
		Record< string, DraftAttachment[] >
	>( {} );
	const [ pendingSelectionsByChat, setPendingSelectionsByChat ] = useState<
		Record< string, AddedSelection[] >
	>( {} );
	// Search query, folder drill path, and scroll position of the resources
	// panel, kept per project so the preview round-trip (open file → click
	// Back) returns the user to the same view they left.
	const [ resourcesViewByProject, setResourcesViewByProject ] = useState<
		Record< string, ResourcesViewState >
	>( {} );
	const [ sidebarOpen, setSidebarOpen ] = useState( true );
	const [ isFullscreen, setIsFullscreen ] = useState( false );
	const [ projects, setProjects ] = useState< Project[] >( [] );
	const [ activeProjectId, setActiveProjectId ] = useState< string | null >(
		null
	);
	const [ activeView, setActiveView ] = useState< View >( 'home' );
	const [ editingDraft, setEditingDraft ] = useState< {
		projectId: string;
		relPath: string;
		title: string;
		folder: 'sources' | 'drafts' | 'done' | 'checks';
	} | null >( null );
	const [ newProjectOpen, setNewProjectOpen ] = useState( false );
	const [ importFolderOpen, setImportFolderOpen ] = useState( false );
	const [ importWordPressOpen, setImportWordPressOpen ] = useState( false );
	const [ importUrlOpen, setImportUrlOpen ] = useState( false );
	const [ importUrlSubPath, setImportUrlSubPath ] = useState( 'sources' );
	const [ createFolderDialog, setCreateFolderDialog ] = useState< {
		open: boolean;
		busy: boolean;
		error: 'invalid-name' | 'collision' | 'io-error' | null;
		parentSubPath: string;
	} >( {
		open: false,
		busy: false,
		error: null,
		parentSubPath: 'sources',
	} );
	const [ searchOpen, setSearchOpen ] = useState( false );
	const [ removingProjectId, setRemovingProjectId ] = useState<
		string | null
	>( null );
	const [ removeBusy, setRemoveBusy ] = useState< boolean >( false );
	const [ removeError, setRemoveError ] = useState< 'io-error' | null >(
		null
	);
	const [ renamingProjectId, setRenamingProjectId ] = useState<
		string | null
	>( null );
	const [ renameBusy, setRenameBusy ] = useState( false );
	const [ renameError, setRenameError ] = useState< 'io-error' | null >(
		null
	);
	const [ goalProjectId, setGoalProjectId ] = useState< string | null >(
		null
	);
	const [ goalBusy, setGoalBusy ] = useState( false );
	const [ goalError, setGoalError ] = useState< 'io-error' | null >( null );
	// Bumped after a source is added (note created or file imported). The
	// ResourcesGrid effect keys on this so the SOURCES list reloads without
	// remounting the grid (drill state + search query preserved).
	const [ sourcesRefreshSignal, setSourcesRefreshSignal ] = useState( 0 );
	// Bumped to ask the project screen to reveal its Tasks sidebar tab —
	// e.g. right after a resource-URL import is queued as a background task.
	const [ revealTasksSignal, setRevealTasksSignal ] = useState( 0 );
	const [ recents, setRecents ] = useState< RecentDraft[] >( [] );
	// Task system state — single source of truth, cross-project. `taskDefs`
	// are saved definitions; `taskRuns` are recent + live runs; `openTaskRunId`
	// is the run whose detail screen is showing; `taskPermissionsByRun` holds
	// pending permission requests for paused runs, keyed by runId.
	const [ taskDefs, setTaskDefs ] = useState< TaskDefinition[] >( [] );
	const [ taskRuns, setTaskRuns ] = useState< TaskRun[] >( [] );
	const [ openTaskRunId, setOpenTaskRunId ] = useState< string | null >(
		null
	);
	const [ taskPermissionsByRun, setTaskPermissionsByRun ] = useState<
		Record< string, PermissionRequest[] >
	>( {} );
	const [ createTaskState, setCreateTaskState ] = useState< {
		open: boolean;
		editDef: TaskDefinition | null;
	} >( { open: false, editDef: null } );
	const [ deletingTask, setDeletingTask ] = useState< TaskDefinition | null >(
		null
	);

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
		const now = Date.now();
		setProjects( ( prev ) =>
			prev.map( ( p ) =>
				p.id === id ? { ...p, lastOpenedAt: now } : p
			)
		);
		void window.api.project.touch( id );
	};

	const handleOpenDraftEditor = ( draft: {
		projectId: string;
		relPath: string;
		title: string;
		folder?: 'sources' | 'drafts' | 'done' | 'checks';
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
		setEditingDraft( null );
		if ( projectId ) {
			setActiveProjectId( projectId );
			setActiveView( 'project' );
		} else {
			setActiveView( 'projects' );
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
		refreshRecent();
	};

	const handleRequestRemoveProject = ( id: string ): void => {
		setRemoveError( null );
		setRemovingProjectId( id );
	};

	const handleCancelRemoveProject = (): void => {
		if ( removeBusy ) {
			return;
		}
		setRemovingProjectId( null );
		setRemoveError( null );
	};

	const handleConfirmRemoveProject = async (): Promise< void > => {
		const id = removingProjectId;
		if ( ! id ) {
			return;
		}
		setRemoveBusy( true );
		setRemoveError( null );
		try {
			await window.api.project.remove( id );
		} catch {
			setRemoveError( 'io-error' );
			setRemoveBusy( false );
			return;
		}
		setProjects( ( prev ) => prev.filter( ( p ) => p.id !== id ) );
		// Forget any per-project caches keyed directly by projectId.
		const dropByProjectId = < V, >(
			map: Record< string, V >
		): Record< string, V > => {
			if ( ! ( id in map ) ) {
				return map;
			}
			const next = { ...map };
			delete next[ id ];
			return next;
		};
		setChatsByProject( dropByProjectId );
		setActiveChatIdByProject( dropByProjectId );
		setClosedChatIdsByProject( dropByProjectId );
		setPreviewedFileByProject( dropByProjectId );
		setResourcesViewByProject( dropByProjectId );
		// Forget caches keyed by `chatKey(projectId, chatId)` — any key
		// starting with `${id}:` belonged to the removed project.
		const prefix = `${ id }:`;
		const dropByChatPrefix = < V, >(
			map: Record< string, V >
		): Record< string, V > => {
			const entries = Object.entries( map ).filter(
				( [ key ] ) => ! key.startsWith( prefix )
			);
			return entries.length === Object.keys( map ).length
				? map
				: Object.fromEntries( entries );
		};
		setMessagesByChat( dropByChatPrefix );
		setBusyChats( dropByChatPrefix );
		setPendingAttachmentsByChat( dropByChatPrefix );
		setPendingSelectionsByChat( dropByChatPrefix );
		for ( const key of Object.keys( streamsByChatRef.current ) ) {
			if ( key.startsWith( prefix ) ) {
				delete streamsByChatRef.current[ key ];
			}
		}
		// If the user just removed the project they were viewing, fall back
		// to the next available project, or send them to the Projects screen.
		if ( activeProjectId === id ) {
			const next = projects.find( ( p ) => p.id !== id ) ?? null;
			setActiveProjectId( next ? next.id : null );
			if ( ! next ) {
				setActiveView( 'home' );
			}
		}
		if ( editingDraft?.projectId === id ) {
			setEditingDraft( null );
			setActiveView( 'home' );
		}
		refreshRecent();
		setRemovingProjectId( null );
		setRemoveBusy( false );
	};

	const handleRequestRenameProject = ( id: string ): void => {
		setRenameError( null );
		setRenamingProjectId( id );
	};

	const handleCancelRenameProject = (): void => {
		if ( renameBusy ) {
			return;
		}
		setRenamingProjectId( null );
		setRenameError( null );
	};

	const handleConfirmRenameProject = async (
		name: string
	): Promise< void > => {
		const id = renamingProjectId;
		if ( ! id ) {
			return;
		}
		setRenameBusy( true );
		setRenameError( null );
		try {
			const updated = await window.api.project.update( id, { name } );
			if ( ! updated ) {
				setRenameError( 'io-error' );
				setRenameBusy( false );
				return;
			}
			setProjects( ( prev ) =>
				prev.map( ( p ) => ( p.id === id ? { ...p, name } : p ) )
			);
		} catch {
			setRenameError( 'io-error' );
			setRenameBusy( false );
			return;
		}
		setRenamingProjectId( null );
		setRenameBusy( false );
	};

	const handleRequestUpdateGoal = ( id: string ): void => {
		setGoalError( null );
		setGoalProjectId( id );
	};

	const handleCancelUpdateGoal = (): void => {
		if ( goalBusy ) {
			return;
		}
		setGoalProjectId( null );
		setGoalError( null );
	};

	const handleConfirmUpdateGoal = async ( goal: string ): Promise< void > => {
		const id = goalProjectId;
		if ( ! id ) {
			return;
		}
		setGoalBusy( true );
		setGoalError( null );
		try {
			const updated = await window.api.project.update( id, { goal } );
			if ( ! updated ) {
				setGoalError( 'io-error' );
				setGoalBusy( false );
				return;
			}
			setProjects( ( prev ) =>
				prev.map( ( p ) =>
					p.id === id ? { ...p, goal: goal || undefined } : p
				)
			);
		} catch {
			setGoalError( 'io-error' );
			setGoalBusy( false );
			return;
		}
		setGoalProjectId( null );
		setGoalBusy( false );
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

	useEffect( () => {
		const handler = ( e: KeyboardEvent ): void => {
			if ( ! ( e.metaKey || e.ctrlKey ) ) {
				return;
			}
			if ( e.key === 'r' ) {
				e.preventDefault();
			}
			if ( e.key === 'b' ) {
				e.preventDefault();
				toggleSidebar();
			}
		};
		window.addEventListener( 'keydown', handler );
		return () => window.removeEventListener( 'keydown', handler );
	}, [] );

	useEffect( () => {
		return window.api.window.onFullscreenChange( setIsFullscreen );
	}, [] );

	const [ prefsHydrated, setPrefsHydrated ] = useState( false );
	const [ sidebarWidth, setSidebarWidth ] = useState< number | undefined >();
	const [ panelOpen, setPanelOpen ] = useState( true );
	const [ panelTab, setPanelTab ] = useState< DraftSidebarTab >( 'chat' );
	useEffect( () => {
		void window.api.uiPrefs.get().then( ( prefs ) => {
			setClosedChatIdsByProject( prefs.closedChatIdsByProject );
			if ( prefs.draftSidebarWidth ) {
				setSidebarWidth( prefs.draftSidebarWidth );
			}
			setPanelOpen( prefs.draftSidebarOpen );
			setPanelTab( prefs.draftSidebarTab );
			setPrefsHydrated( true );
		} );
		// State setters are stable — listed to satisfy the linter.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ setPanelOpen, setPanelTab ] );

	const handleSidebarWidthChange = useCallback( ( width: number ) => {
		setSidebarWidth( width );
		void window.api.uiPrefs.set( { draftSidebarWidth: width } );
	}, [] );

	const handleSidebarOpenChange = useCallback(
		( open: boolean ) => {
			setPanelOpen( open );
			void window.api.uiPrefs.set( { draftSidebarOpen: open } );
		},
		[ setPanelOpen ]
	);

	const handleSidebarTabChange = useCallback(
		( tab: DraftSidebarTab ) => {
			setPanelTab( tab );
			void window.api.uiPrefs.set( { draftSidebarTab: tab } );
		},
		[ setPanelTab ]
	);

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
		} );
		refreshRecent();
	}, [] );

	// Hydrate task definitions + recent runs once on mount.
	useEffect( () => {
		void window.api.tasks.list().then( setTaskDefs );
		void window.api.tasks.runList().then( setTaskRuns );
	}, [] );

	// One listener for task-system events (run status, permission requests,
	// definition changes). The run transcript is not streamed — the detail
	// screen polls `tasks.runLoad` while a run is live.
	useEffect( () => {
		const off = window.api.tasks.onEvent( ( event ) => {
			switch ( event.kind ) {
				case 'run-status': {
					setTaskRuns( ( prev ) => {
						const idx = prev.findIndex(
							( r ) => r.id === event.runId
						);
						if ( idx >= 0 ) {
							const next = [ ...prev ];
							next[ idx ] = event.run;
							return next;
						}
						return [ event.run, ...prev ];
					} );
					const terminal =
						event.run.status === 'done' ||
						event.run.status === 'error' ||
						event.run.status === 'stopped';
					if ( terminal ) {
						setTaskPermissionsByRun( ( prev ) => {
							if ( ! ( event.runId in prev ) ) {
								return prev;
							}
							const next = { ...prev };
							delete next[ event.runId ];
							return next;
						} );
					}
					if ( event.run.status === 'done' ) {
						// A finished task may have written a draft or source.
						refreshRecent();
						setSourcesRefreshSignal( ( n ) => n + 1 );
					}
					return;
				}
				case 'run-permission-request': {
					setTaskPermissionsByRun( ( prev ) => ( {
						...prev,
						[ event.runId ]: [
							...( prev[ event.runId ] ?? [] ),
							{
								requestId: event.requestId,
								projectId: event.projectId,
								chatId: '',
								runId: event.runId,
								toolName: event.toolName,
								input: event.input,
							},
						],
					} ) );
					return;
				}
				case 'definitions-changed': {
					void window.api.tasks.list().then( setTaskDefs );
				}
			}
		} );
		return off;
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
				const restored = persistedToMessages( persisted );
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

	// Mirrors the active chat key so the `agent:onEvent` listener — registered
	// once with a stale closure — can tell whether a finishing run belongs to
	// the chat the user is currently looking at before auto-opening a draft.
	const activeChatKeyRef = useRef< string | null >( null );
	activeChatKeyRef.current = activeKey;

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
					if ( FILE_WRITING_TOOLS.has( event.toolName ) ) {
						setSourcesRefreshSignal( ( n ) => n + 1 );
					}
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
					// When the turn created exactly one draft/note, jump
					// straight into editing it — but only if the user is still
					// on the chat that produced it, so a background run can't
					// yank focus away from whatever they're doing now.
					if (
						event.openResource &&
						key === activeChatKeyRef.current
					) {
						const { folder, relPath } = event.openResource;
						const base = relPath.split( '/' ).pop() ?? relPath;
						handleOpenDraftEditor( {
							projectId,
							relPath,
							title: stripExtension( base ),
							folder,
						} );
					}
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
						event.code === 'invalid_api_key' ||
						event.code === 'claude_code_signed_out' ||
						event.code === 'claude_code_subscription_invalid'
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
		setPendingAttachmentsByChat( ( prev ) => {
			if ( ! prev[ key ]?.length ) {
				return prev;
			}
			const next = { ...prev };
			delete next[ key ];
			return next;
		} );
		setPendingSelectionsByChat( ( prev ) => {
			if ( ! prev[ key ]?.length ) {
				return prev;
			}
			const next = { ...prev };
			delete next[ key ];
			return next;
		} );
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

	// Importing a resource URL runs as a one-off background task — no chat.
	// The running import surfaces in the sidebar's Tasks tab (the rail icon
	// badges) and the global Tasks view; the resource appears when it finishes.
	const startImportUrlTask = async ( url: string ): Promise< void > => {
		if ( ! activeProjectId ) {
			throw new Error( 'Open a project before importing a URL.' );
		}
		const result = await window.api.tasks.importUrl(
			url,
			activeProjectId,
			importUrlSubPath
		);
		if ( result.error ) {
			throw new Error(
				result.error === 'bad-url'
					? "That doesn't look like a URL. Try something like https://example.com/article."
					: 'Could not start the import.'
			);
		}
		// Surface the running import: open the project sidebar's Tasks tab.
		setRevealTasksSignal( ( n ) => n + 1 );
	};

	const stripExtension = ( name: string ): string => {
		const dot = name.lastIndexOf( '.' );
		return dot > 0 ? name.slice( 0, dot ) : name;
	};

	const handlePreviewFile = (
		folder: 'sources' | 'drafts' | 'done' | 'checks',
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
		// Markdown files from any folder open in the full editor shell
		// instead of the lightweight ResourcePreview. Drafts already route
		// through onEditDraft in ResourcesGrid, but done/sources/checks
		// land here via onPreviewFile.
		if (
			( folder === 'sources' ||
				folder === 'done' ||
				folder === 'checks' ) &&
			isMarkdown( name )
		) {
			const dot = name.lastIndexOf( '.' );
			const title = dot > 0 ? name.slice( 0, dot ) : name;
			handleOpenDraftEditor( {
				projectId: activeProjectId,
				relPath,
				title,
				folder,
			} );
			return;
		}
		setPreviewedFileByProject( ( prev ) => ( {
			...prev,
			[ activeProjectId ]: { folder, relPath, name },
		} ) );
	};

	// Click target for in-message file/folder chips. Drafts and done open in
	// the full-screen editor; sources fall back to the project preview pane
	// (and pop the editor first if it's open, since the editor has no
	// preview). Folders drill into the resources panel.
	const handleOpenAttachmentFromChat = (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string,
		name: string,
		isDirectory = false
	): void => {
		if ( ! activeProjectId ) {
			return;
		}
		if ( isDirectory ) {
			if ( activeView === 'draft-editor' ) {
				handleBackFromDraftEditor();
			}
			setActiveProjectId( activeProjectId );
			setActiveView( 'project' );
			// Close any active preview so the grid (with the drill) is visible.
			setPreviewedFileByProject( ( prev ) => {
				if ( ! ( activeProjectId in prev ) ) {
					return prev;
				}
				const next = { ...prev };
				delete next[ activeProjectId ];
				return next;
			} );
			setResourcesViewByProject( ( prev ) => {
				const current = prev[ activeProjectId ] ?? defaultResourcesView;
				return {
					...prev,
					[ activeProjectId ]: {
						...current,
						query: '',
						drill: {
							groupKey: folder,
							parts: relPath.split( '/' ).filter( Boolean ),
						},
					},
				};
			} );
			return;
		}
		if (
			folder === 'drafts' ||
			folder === 'done' ||
			( ( folder === 'sources' || folder === 'checks' ) &&
				isMarkdown( name ) )
		) {
			const dot = name.lastIndexOf( '.' );
			const title = dot > 0 ? name.slice( 0, dot ) : name;
			setEditingDraft( {
				projectId: activeProjectId,
				relPath,
				title,
				folder,
			} );
			setActiveView( 'draft-editor' );
			return;
		}
		if ( activeView === 'draft-editor' ) {
			handleBackFromDraftEditor();
		}
		handlePreviewFile( folder, relPath, name );
	};

	const handleAddToChat = (
		folder: 'sources' | 'drafts' | 'done' | 'checks',
		relPath: string,
		name: string,
		isDirectory = false
	): void => {
		if ( ! activeProjectId || ! activeChatId ) {
			return;
		}
		const key = chatKey( activeProjectId, activeChatId );
		setPendingAttachmentsByChat( ( prev ) => {
			const cur = prev[ key ] ?? [];
			if (
				cur.some(
					( a ) => a.folder === folder && a.relPath === relPath
				)
			) {
				return prev;
			}
			return {
				...prev,
				[ key ]: [
					...cur,
					{
						kind: 'draft',
						folder,
						relPath,
						name,
						mtime: null,
						...( isDirectory ? { isDirectory: true } : {} ),
					},
				],
			};
		} );
	};

	// Pipe a drag-drop selection of project files into the existing add-to-chat
	// flow. Folders pass through as folder-attachments — the agent gets the
	// folder path and walks it with Glob/Read.
	const handleAttachResourcesToChat = (
		items: Array< {
			folder: 'sources' | 'drafts' | 'done';
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >
	): void => {
		for ( const it of items ) {
			handleAddToChat(
				it.folder,
				it.relPath,
				it.name,
				it.kind === 'dir'
			);
		}
	};

	// Resolve File objects to OS absolute paths via Electron's webUtils, then
	// stream them into a single IPC import + post-import dispatcher. Falls back
	// to the legacy `.path` property if webUtils isn't around (older renderers,
	// embedded test contexts). `dispatch` decides what to do with each imported
	// relPath — drop on the grid wants a refresh; drop on chat wants attachment.
	const importDroppedFiles = async (
		subPath: string,
		files: File[],
		dispatch: ( fileName: string, relPath: string ) => void
	): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const electron = (
			window as unknown as {
				electron?: {
					webUtils?: { getPathForFile: ( f: File ) => string };
				};
			}
		 ).electron;
		const paths: string[] = [];
		for ( const f of files ) {
			let abs = '';
			if ( electron?.webUtils?.getPathForFile ) {
				abs = electron.webUtils.getPathForFile( f );
			}
			if ( ! abs ) {
				abs = ( f as File & { path?: string } ).path ?? '';
			}
			if ( abs ) {
				paths.push( abs );
			}
		}
		if ( paths.length === 0 ) {
			return;
		}
		const result = await window.api.sources.importDroppedFiles(
			activeProjectId,
			subPath,
			paths
		);
		for ( const r of result.results ) {
			if ( r.ok ) {
				dispatch( r.fileName, r.relPath );
			}
		}
		setSourcesRefreshSignal( ( n ) => n + 1 );
	};

	const handleDropOsFilesToSources = (
		files: File[],
		_destFolder: 'sources' | 'drafts' | 'done',
		destSubPath: string
	): void => {
		// destFolder is always 'sources' for grid/folder drops in v1 — the
		// import IPC clamps to sources/ regardless, so we just forward destSubPath.
		void importDroppedFiles( destSubPath, files, () => {
			// no per-file follow-up — the refresh tick will pick the new cards up.
		} );
	};

	const handleDropOsFilesToChat = ( files: File[] ): void => {
		void importDroppedFiles( 'sources', files, ( fileName, relPath ) => {
			handleAddToChat( 'sources', relPath, fileName );
		} );
	};

	const handleMoveResources = async (
		items: Array< {
			folder: 'sources' | 'drafts' | 'done';
			relPath: string;
			name: string;
			kind: 'file' | 'dir';
		} >,
		destFolder: 'sources' | 'drafts' | 'done',
		destSubPath: string
	): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const result = await window.api.resources.move(
			projectId,
			items,
			destFolder,
			destSubPath
		);
		// Re-point the active preview if the file it was showing got moved.
		const previewed = previewedFileByProject[ projectId ];
		if ( previewed ) {
			const match = result.results.find(
				( r ) =>
					r.ok &&
					previewed.folder === destFolder &&
					previewed.relPath === r.oldRelPath
			);
			if ( match && match.ok && match.newRelPath !== match.oldRelPath ) {
				setPreviewedFileByProject( ( prev ) => ( {
					...prev,
					[ projectId ]: {
						folder: destFolder,
						relPath: match.newRelPath,
						name: previewed.name,
					},
				} ) );
			}
		}
		setSourcesRefreshSignal( ( n ) => n + 1 );
	};

	const handleAddSelectionToChat = ( selection: MessageSelection ): void => {
		if ( ! activeProjectId || ! activeChatId ) {
			return;
		}
		const key = chatKey( activeProjectId, activeChatId );
		setPendingSelectionsByChat( ( prev ) => {
			const cur = prev[ key ] ?? [];
			return {
				...prev,
				[ key ]: [ ...cur, withSelectionId( selection ) ],
			};
		} );
	};

	const handleRemovePendingAttachment = (
		folder: 'sources' | 'drafts' | 'done',
		relPath: string
	): void => {
		if ( ! activeProjectId || ! activeChatId ) {
			return;
		}
		const key = chatKey( activeProjectId, activeChatId );
		setPendingAttachmentsByChat( ( prev ) => {
			const cur = prev[ key ] ?? [];
			return {
				...prev,
				[ key ]: cur.filter(
					( a ) => ! ( a.folder === folder && a.relPath === relPath )
				),
			};
		} );
	};

	const handleClearPendingSelections = (): void => {
		if ( ! activeProjectId || ! activeChatId ) {
			return;
		}
		const key = chatKey( activeProjectId, activeChatId );
		setPendingSelectionsByChat( ( prev ) => {
			if ( ! ( key in prev ) ) {
				return prev;
			}
			const next = { ...prev };
			delete next[ key ];
			return next;
		} );
	};

	const handleOpenNewChat = async (
		folder: 'sources' | 'drafts' | 'done' | 'checks',
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
		// Seed the new chat with the resource already attached — matches the
		// menu label "Open new chat" against a specific file.
		setPendingAttachmentsByChat( ( prev ) => ( {
			...prev,
			[ chatKey( projectId, chat.id ) ]: [
				{ kind: 'draft', folder, relPath, name, mtime: null },
			],
		} ) );
	};

	const handleNewDraft = async ( subPath = 'drafts' ): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const result = await window.api.drafts.create( projectId, subPath );
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

	const handleEngageAINewDraft = async (): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const prompt = await window.api.prompt.get( 'draft', projectId );
		const chat = await window.api.chat.create( projectId, {
			title: 'New draft',
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
		await sendMessage( prompt, projectId, chat.id );
	};

	const handleAddNote = async ( subPath = 'sources' ): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const result = await window.api.sources.createNote(
			projectId,
			subPath
		);
		if ( ! result.ok ) {
			return;
		}
		// Open the new note in the existing source-markdown preview surface.
		// `InlineFileEditor` mounts there and (for sources/*.md) renders the
		// title input + auto-rename. Bumping the refresh signal too means the
		// SOURCES list shows the card the moment the user clicks Back.
		// `relPath` is relative to the `sources/` group root so the preview
		// resolves to the new note regardless of which subfolder it lives in.
		setPreviewedFileByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: {
				folder: 'sources',
				relPath: result.relPath,
				name: result.relPath,
			},
		} ) );
		setSourcesRefreshSignal( ( n ) => n + 1 );
	};

	const handleImportFile = async ( subPath = 'sources' ): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const result = await window.api.sources.importFile(
			projectId,
			subPath
		);
		if ( ! result.ok ) {
			return;
		}
		if ( result.results.some( ( r ) => r.ok ) ) {
			setSourcesRefreshSignal( ( n ) => n + 1 );
		}
	};

	const handleCreateFolder = ( parentSubPath: string ): void => {
		setCreateFolderDialog( {
			open: true,
			busy: false,
			error: null,
			parentSubPath,
		} );
	};

	const handleCancelCreateFolder = (): void => {
		setCreateFolderDialog( ( prev ) =>
			prev.busy ? prev : { ...prev, open: false, error: null }
		);
	};

	const handleConfirmCreateFolder = async (
		name: string
	): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const { parentSubPath } = createFolderDialog;
		setCreateFolderDialog( ( prev ) => ( {
			...prev,
			busy: true,
			error: null,
		} ) );
		const result = await window.api.project.createFolder(
			projectId,
			parentSubPath,
			name
		);
		if ( result.ok !== true ) {
			const reason = result.reason;
			setCreateFolderDialog( ( prev ) => ( {
				...prev,
				busy: false,
				error: reason === 'not-found' ? 'io-error' : reason,
			} ) );
			return;
		}
		setCreateFolderDialog( ( prev ) => ( {
			...prev,
			open: false,
			busy: false,
			error: null,
		} ) );
		// Drill into the new folder. `result.relPath` is project-rooted
		// (e.g. `sources/notes/ideas`); the resources view stores the
		// group key + an array of parts under that group's root.
		const segments = result.relPath.split( '/' );
		const [ groupFolder, ...rest ] = segments;
		const groupKey: 'sources' | 'drafts' | 'done' | null =
			groupFolder === 'sources' ||
			groupFolder === 'drafts' ||
			groupFolder === 'done'
				? groupFolder
				: null;
		if ( groupKey ) {
			setResourcesViewByProject( ( prev ) => {
				const current = prev[ projectId ] ?? defaultResourcesView;
				return {
					...prev,
					[ projectId ]: {
						...current,
						query: '',
						drill: { groupKey, parts: rest },
					},
				};
			} );
		}
		setSourcesRefreshSignal( ( n ) => n + 1 );
	};

	// Called from ResourcePreview when the inline note title triggers an
	// auto-rename or the user does an explicit rename. We update the preview
	// pointer to the renamed file so the next render (and any subsequent
	// back-and-forth with the resources grid) targets the right path.
	const handlePreviewRelPathChanged = (
		folder: 'sources' | 'drafts' | 'done',
		oldRelPath: string,
		newRelPath: string
	): void => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		setPreviewedFileByProject( ( prev ) => {
			const current = prev[ projectId ];
			if (
				! current ||
				current.folder !== folder ||
				current.relPath !== oldRelPath
			) {
				return prev;
			}
			return {
				...prev,
				[ projectId ]: {
					folder,
					relPath: newRelPath,
					name: newRelPath,
				},
			};
		} );
		if ( folder === 'sources' ) {
			setSourcesRefreshSignal( ( n ) => n + 1 );
		}
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

	const onCreateOrUpdateVoice = async (
		action: 'create' | 'update'
	): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const chat = await window.api.chat.create( projectId, {
			title: action === 'update' ? 'Voice update' : 'Voice setup',
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
		await window.api.uiPrefs.set( {
			draftSidebarOpen: true,
			draftSidebarTab: 'chat',
		} );
		handleOpenDraftEditor( {
			projectId,
			relPath: 'voice.md',
			title: 'Voice',
			folder: 'checks',
		} );
		await sendMessage( voiceTriggerPrompt( action ), projectId, chat.id );
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
		setPendingAttachmentsByChat( ( prev ) => {
			const key = chatKey( projectId, chatId );
			if ( ! ( key in prev ) ) {
				return prev;
			}
			const next = { ...prev };
			delete next[ key ];
			return next;
		} );
		setPendingSelectionsByChat( ( prev ) => {
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
			if ( next ) {
				setActiveChatIdByProject( ( prev ) => ( {
					...prev,
					[ projectId ]: next,
				} ) );
			} else {
				// Last visible chat was deleted — create a fresh one so the
				// composer stays usable.
				const created = await window.api.chat.create( projectId );
				if ( created ) {
					setChatsByProject( ( prev ) => ( {
						...prev,
						[ projectId ]: [
							...( prev[ projectId ] ?? [] ),
							created,
						],
					} ) );
					setActiveChatIdByProject( ( prev ) => ( {
						...prev,
						[ projectId ]: created.id,
					} ) );
					setMessagesByChat( ( prev ) => ( {
						...prev,
						[ chatKey( projectId, created.id ) ]: [],
					} ) );
				} else {
					setActiveChatIdByProject( ( prev ) => {
						const copy = { ...prev };
						delete copy[ projectId ];
						return copy;
					} );
				}
			}
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
	// What the user is currently looking at, fed to the chat composer so
	// every outgoing message silently carries a reference to it. The full
	// editor wins over a sibling preview in the resources panel — the
	// editor is the user's primary focus when it's mounted.
	const activeOpenResource: OpenResource | null =
		activeView === 'draft-editor' && editingDraft
			? {
					folder: editingDraft.folder,
					relPath: editingDraft.relPath,
					name: editingDraft.title,
			  }
			: activePreviewedFile;
	// Where the user is when no file is open. Only consulted by the chat
	// composer when `activeOpenResource` is null — a file's path already
	// conveys its folder, so the view line would be redundant alongside it.
	const activeDrill =
		activeProjectId && resourcesViewByProject[ activeProjectId ]
			? resourcesViewByProject[ activeProjectId ].drill
			: null;
	const activeCurrentView: CurrentView | null = ( () => {
		if ( activeView !== 'project' || activePreviewedFile ) {
			return null;
		}
		if ( ! activeDrill ) {
			return { kind: 'project-home' };
		}
		return {
			kind: 'folder',
			folder: activeDrill.groupKey,
			subPath: activeDrill.parts.join( '/' ),
		};
	} )();
	const activePendingAttachments = activeKey
		? pendingAttachmentsByChat[ activeKey ] ?? []
		: [];
	const activePendingSelections = activeKey
		? pendingSelectionsByChat[ activeKey ] ?? []
		: [];

	const onCancelChat = ( chatId: string ): void => {
		if ( ! activeProjectId ) {
			return;
		}
		if ( ! busyChats[ chatKey( activeProjectId, chatId ) ] ) {
			return;
		}
		void window.api.agent.cancel( activeProjectId, chatId );
	};

	const handleOpenTaskRun = ( run: TaskRun ): void => {
		setOpenTaskRunId( run.id );
		setActiveView( 'task-detail' );
	};
	const handleBackFromTaskDetail = (): void => {
		setOpenTaskRunId( null );
		setActiveView( 'tasks' );
	};
	const handleStopTaskRun = ( runId: string ): void => {
		void window.api.tasks.runStop( runId );
	};
	const handleRunDefinition = ( projectId: string, defId: string ): void => {
		void window.api.tasks.run( projectId, defId );
	};
	const handleRerunTask = async ( run: TaskRun ): Promise< void > => {
		if ( ! run.definitionId ) {
			return;
		}
		const { runId } = await window.api.tasks.run(
			run.projectId,
			run.definitionId
		);
		if ( runId ) {
			setOpenTaskRunId( runId );
		}
	};
	const handleTaskPermissionDecision = (
		requestId: string,
		decision: 'allow' | 'deny'
	): void => {
		let runId: string | null = null;
		for ( const [ rid, list ] of Object.entries( taskPermissionsByRun ) ) {
			if ( list.some( ( p ) => p.requestId === requestId ) ) {
				runId = rid;
				break;
			}
		}
		setTaskPermissionsByRun( ( prev ) => {
			const next: Record< string, PermissionRequest[] > = {};
			for ( const [ rid, list ] of Object.entries( prev ) ) {
				const filtered = list.filter(
					( p ) => p.requestId !== requestId
				);
				if ( filtered.length > 0 ) {
					next[ rid ] = filtered;
				}
			}
			return next;
		} );
		if ( runId ) {
			void window.api.tasks.respondPermission(
				runId,
				requestId,
				decision
			);
		}
	};
	const handleConfirmDeleteTask = (): void => {
		if ( ! deletingTask ) {
			return;
		}
		void window.api.tasks.delete( deletingTask.projectId, deletingTask.id );
		setDeletingTask( null );
	};

	// Runs that are not in a terminal state — drive the sidebar badge and the
	// project Tasks panel.
	const runningTaskRuns = taskRuns.filter(
		( r ) =>
			r.status === 'running' ||
			r.status === 'queued' ||
			r.status === 'needs-permission'
	);
	const needsPermissionTaskCount = taskRuns.filter(
		( r ) => r.status === 'needs-permission'
	).length;
	const projectTaskRuns = activeProjectId
		? taskRuns.filter( ( r ) => r.projectId === activeProjectId )
		: [];
	const projectTaskDefs = activeProjectId
		? taskDefs.filter( ( d ) => d.projectId === activeProjectId )
		: [];

	return (
		<div
			className="app"
			data-sidebar-open={ sidebarOpen ? 'true' : 'false' }
			data-fullscreen={ isFullscreen ? 'true' : 'false' }
		>
			<Sidebar
				isOpen={ sidebarOpen }
				onToggle={ toggleSidebar }
				onSearch={ () => setSearchOpen( true ) }
				projectCount={ projects.length }
				taskCount={ taskDefs.length }
				runningTaskCount={ runningTaskRuns.length }
				needsPermissionCount={ needsPermissionTaskCount }
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

			<NewProjectModal
				open={ newProjectOpen }
				onClose={ () => setNewProjectOpen( false ) }
				onCreated={ handleProjectCreated }
			/>

			<ImportFolderModal
				open={ importFolderOpen }
				onClose={ () => setImportFolderOpen( false ) }
				onCreated={ handleProjectCreated }
			/>

			<ImportWordPressModal
				open={ importWordPressOpen }
				onClose={ () => setImportWordPressOpen( false ) }
				onCreated={ handleProjectCreated }
			/>

			<RemoveProjectDialog
				open={ removingProjectId !== null }
				projectName={
					projects.find( ( p ) => p.id === removingProjectId )
						?.name ?? ''
				}
				projectPath={
					projects.find( ( p ) => p.id === removingProjectId )
						?.path ?? ''
				}
				busy={ removeBusy }
				error={ removeError }
				onConfirm={ () => {
					void handleConfirmRemoveProject();
				} }
				onCancel={ handleCancelRemoveProject }
			/>

			<RenameProjectDialog
				open={ renamingProjectId !== null }
				currentName={
					projects.find( ( p ) => p.id === renamingProjectId )
						?.name ?? ''
				}
				busy={ renameBusy }
				error={ renameError }
				onConfirm={ ( name ) => {
					void handleConfirmRenameProject( name );
				} }
				onCancel={ handleCancelRenameProject }
			/>

			<UpdateGoalDialog
				open={ goalProjectId !== null }
				currentGoal={
					projects.find( ( p ) => p.id === goalProjectId )?.goal ?? ''
				}
				busy={ goalBusy }
				error={ goalError }
				onConfirm={ ( goal ) => {
					void handleConfirmUpdateGoal( goal );
				} }
				onCancel={ handleCancelUpdateGoal }
			/>

			<ImportUrlModal
				open={ importUrlOpen }
				onClose={ () => setImportUrlOpen( false ) }
				onSubmit={ startImportUrlTask }
			/>

			<CreateTaskModal
				open={ createTaskState.open }
				onClose={ () =>
					setCreateTaskState( { open: false, editDef: null } )
				}
				projects={ projects }
				defaultProjectId={ activeProjectId }
				editDef={ createTaskState.editDef }
			/>

			<DeleteTaskDialog
				open={ deletingTask !== null }
				taskTitle={ deletingTask?.title ?? '' }
				onConfirm={ handleConfirmDeleteTask }
				onCancel={ () => setDeletingTask( null ) }
			/>

			<CreateFolderDialog
				open={ createFolderDialog.open }
				parentLabel={ subPathToLabel(
					createFolderDialog.parentSubPath
				) }
				busy={ createFolderDialog.busy }
				error={ createFolderDialog.error }
				onConfirm={ ( name ) => {
					void handleConfirmCreateFolder( name );
				} }
				onCancel={ handleCancelCreateFolder }
			/>

			<SearchModal
				open={ searchOpen }
				onClose={ () => setSearchOpen( false ) }
				projects={ projects }
				onSelect={ handleSelectProject }
				onSelectDraft={ handleOpenDraftEditor }
			/>

			<div className="main">
				<div
					className="main-top"
					data-testid="titlebar"
					data-view={ activeView }
				>
					{ ! sidebarOpen && (
						<TopActions
							onToggle={ toggleSidebar }
							tabbable={ true }
							toggleLabel="Show sidebar (⌘B)"
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
									id="project-titlebar-slot"
									className="main-top-project"
								/>
							) }
						</>
					) }
					{ activeView === 'draft-editor' && (
						<div
							id="draft-editor-titlebar-slot"
							className="main-top-draft-editor"
						/>
					) }
					{ activeView === 'task-detail' && (
						<div
							id="task-detail-titlebar-slot"
							className="main-top-task-detail"
						/>
					) }
				</div>
				<div className="workspace" data-testid="workspace">
					{ activeView === 'home' && (
						<HomeScreen
							onNewProject={ () => setNewProjectOpen( true ) }
							onImportFolder={ () => setImportFolderOpen( true ) }
							onImportWordPress={ () =>
								setImportWordPressOpen( true )
							}
							recentProjects={ ( () => {
								const draftMtime = new Map< string, number >();
								for ( const r of recents ) {
									const prev =
										draftMtime.get( r.projectId ) ?? 0;
									if ( r.mtime > prev ) {
										draftMtime.set( r.projectId, r.mtime );
									}
								}
								return projects
									.filter(
										( p ) =>
											p.lastOpenedAt ||
											draftMtime.has( p.id )
									)
									.map(
										( p ): RecentProject => ( {
											id: p.id,
											name: p.name,
											lastActivity: Math.max(
												p.lastOpenedAt ?? 0,
												draftMtime.get( p.id ) ?? 0
											),
										} )
									)
									.sort(
										( a, b ) =>
											b.lastActivity - a.lastActivity
									)
									.slice( 0, 10 );
							} )() }
							onSelectProject={ handleSelectProject }
						/>
					) }
					{ activeView === 'projects' && (
						<ProjectsScreen
							projects={ projects }
							onSelect={ handleSelectProject }
							onRename={ handleRequestRenameProject }
							onUpdateGoal={ handleRequestUpdateGoal }
							onSetUpVoice={ ( id, action ) => {
								setActiveProjectId( id );
								setActiveView( 'project' );
								void onCreateOrUpdateVoice( action );
							} }
							onRemove={ handleRequestRemoveProject }
						/>
					) }
					{ activeView === 'tasks' && (
						<TasksScreen
							definitions={ taskDefs }
							runs={ taskRuns }
							projects={ projects }
							onOpenRun={ handleOpenTaskRun }
							onStopRun={ handleStopTaskRun }
							onRunDefinition={ handleRunDefinition }
							onEditDefinition={ ( def ) =>
								setCreateTaskState( {
									open: true,
									editDef: def,
								} )
							}
							onDeleteDefinition={ ( def ) =>
								setDeletingTask( def )
							}
							onNewTask={ () =>
								setCreateTaskState( {
									open: true,
									editDef: null,
								} )
							}
						/>
					) }
					{ activeView === 'task-detail' &&
						openTaskRunId &&
						( () => {
							const run = taskRuns.find(
								( r ) => r.id === openTaskRunId
							);
							if ( ! run ) {
								return null;
							}
							const project = projects.find(
								( p ) => p.id === run.projectId
							);
							const definition = run.definitionId
								? taskDefs.find(
										( d ) => d.id === run.definitionId
								  ) ?? null
								: null;
							return (
								<TaskDetailScreen
									run={ run }
									definition={ definition }
									projectName={
										project?.name ?? 'Unknown project'
									}
									projectPath={ project?.path ?? null }
									permissions={
										taskPermissionsByRun[ run.id ] ?? []
									}
									onBack={ handleBackFromTaskDetail }
									onStop={ () => handleStopTaskRun( run.id ) }
									onRerun={ () => {
										void handleRerunTask( run );
									} }
									onPermissionDecision={
										handleTaskPermissionDecision
									}
								/>
							);
						} )() }
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
							openResource={ activeOpenResource }
							onBack={ handleBackFromDraftEditor }
							onRelPathChanged={ ( newRelPath ) =>
								setEditingDraft( ( prev ) =>
									prev
										? { ...prev, relPath: newRelPath }
										: prev
								)
							}
							onPublishedAndMoved={ ( newRelPath ) => {
								setEditingDraft( ( prev ) =>
									prev
										? {
												...prev,
												relPath: newRelPath,
												folder: 'done',
										  }
										: prev
								);
								refreshRecent();
							} }
							chats={ activeProjectChats }
							activeChatId={ activeChatId }
							messages={ messages }
							busy={ activeBusy }
							permissions={ activePermissions }
							pendingAttachments={ activePendingAttachments }
							pendingSelections={ activePendingSelections }
							onAddSelection={ handleAddSelectionToChat }
							onClearPendingSelections={
								handleClearPendingSelections
							}
							onRemovePendingAttachment={
								handleRemovePendingAttachment
							}
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
							onAttachResources={ handleAttachResourcesToChat }
							onDropOsFilesToChat={ handleDropOsFilesToChat }
							onPreviewAttachment={ handleOpenAttachmentFromChat }
							sidebarOpen={ prefsHydrated && panelOpen }
							sidebarTab={ panelTab }
							onSidebarOpenChange={ handleSidebarOpenChange }
							onSidebarTabChange={ handleSidebarTabChange }
							sidebarWidth={ sidebarWidth }
							onSidebarWidthChange={ handleSidebarWidthChange }
							onAddToChat={ () => {
								const name =
									editingDraft.relPath.split( '/' ).pop() ??
									editingDraft.relPath;
								handleAddToChat(
									editingDraft.folder,
									editingDraft.relPath,
									name
								);
							} }
							onOpenNewChat={ () => {
								const name =
									editingDraft.relPath.split( '/' ).pop() ??
									editingDraft.relPath;
								void handleOpenNewChat(
									editingDraft.folder,
									editingDraft.relPath,
									name
								);
							} }
							onOpenVoiceFile={ () => {
								handleOpenDraftEditor( {
									projectId: editingDraft.projectId,
									relPath: 'voice.md',
									title: 'Voice',
									folder: 'checks',
								} );
							} }
							onOpenCheckInMiddle={ ( rp ) => {
								// Retarget the middle window at the new check.
								// Title is just a placeholder — the editor
								// reads the real one from frontmatter on load.
								const baseName = rp.replace( /\.md$/i, '' );
								handleOpenDraftEditor( {
									projectId: editingDraft.projectId,
									relPath: rp,
									title: baseName,
									folder: 'checks',
								} );
							} }
							taskProjectName={
								projects.find(
									( p ) => p.id === editingDraft.projectId
								)?.name ?? ''
							}
							taskRuns={ projectTaskRuns }
							taskDefs={ projectTaskDefs }
							onOpenTaskRun={ handleOpenTaskRun }
							onStopTaskRun={ handleStopTaskRun }
							onRunTaskDefinition={ ( defId ) =>
								handleRunDefinition(
									editingDraft.projectId,
									defId
								)
							}
							onEditTaskDefinition={ ( def ) =>
								setCreateTaskState( {
									open: true,
									editDef: def,
								} )
							}
							onDeleteTaskDefinition={ ( def ) =>
								setDeletingTask( def )
							}
							onNewTask={ () =>
								setCreateTaskState( {
									open: true,
									editDef: null,
								} )
							}
						/>
					) }
					{ activeView === 'project' && (
						<ProjectScreen
							activeProjectId={ activeProjectId }
							projectName={
								projects.find(
									( p ) => p.id === activeProjectId
								)?.name ?? ''
							}
							activeChatId={ activeChatId }
							chats={ activeProjectChats }
							messages={ messages }
							permissions={ activePermissions }
							busy={ activeBusy }
							previewedFile={ activePreviewedFile }
							openResource={ activeOpenResource }
							currentView={ activeCurrentView }
							pendingAttachments={ activePendingAttachments }
							pendingSelections={ activePendingSelections }
							onRemovePendingAttachment={
								handleRemovePendingAttachment
							}
							onPreviewAttachment={ handleOpenAttachmentFromChat }
							onAddSelection={ handleAddSelectionToChat }
							onClearPendingSelections={
								handleClearPendingSelections
							}
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
							onAddToChat={ handleAddToChat }
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
							onNewDraft={ ( subPath ) => {
								void handleNewDraft( subPath );
							} }
							onEngageAINewDraft={ () => {
								void handleEngageAINewDraft();
							} }
							onImportUrl={ ( subPath ) => {
								setImportUrlSubPath( subPath );
								setImportUrlOpen( true );
							} }
							onImportFile={ ( subPath ) => {
								void handleImportFile( subPath );
							} }
							onAddNote={ ( subPath ) => {
								void handleAddNote( subPath );
							} }
							onCreateFolder={ ( parentSubPath ) => {
								void handleCreateFolder( parentSubPath );
							} }
							onMoveResources={ (
								items,
								destFolder,
								destSubPath
							) => {
								void handleMoveResources(
									items,
									destFolder,
									destSubPath
								);
							} }
							onDropOsFiles={ handleDropOsFilesToSources }
							onAttachResources={ handleAttachResourcesToChat }
							onDropOsFilesToChat={ handleDropOsFilesToChat }
							sourcesRefreshSignal={ sourcesRefreshSignal }
							revealTasksSignal={ revealTasksSignal }
							onPreviewRelPathChanged={
								handlePreviewRelPathChanged
							}
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
							sidebarOpen={ prefsHydrated && panelOpen }
							sidebarTab={ panelTab }
							onSidebarOpenChange={ handleSidebarOpenChange }
							onSidebarTabChange={ handleSidebarTabChange }
							sidebarWidth={ sidebarWidth }
							onSidebarWidthChange={ handleSidebarWidthChange }
							onCreateOrUpdateVoice={ ( action ) => {
								void onCreateOrUpdateVoice( action );
							} }
							onOpenVoiceFile={ () => {
								if ( activeProjectId ) {
									handleOpenDraftEditor( {
										projectId: activeProjectId,
										relPath: 'voice.md',
										title: 'Voice',
										folder: 'checks',
									} );
								}
							} }
							onRenameProject={ () => {
								if ( activeProjectId ) {
									handleRequestRenameProject(
										activeProjectId
									);
								}
							} }
							onUpdateGoal={ () => {
								if ( activeProjectId ) {
									handleRequestUpdateGoal( activeProjectId );
								}
							} }
							onRemoveProject={ () => {
								if ( activeProjectId ) {
									handleRequestRemoveProject(
										activeProjectId
									);
								}
							} }
							projectTaskRuns={ projectTaskRuns }
							projectTaskDefs={ projectTaskDefs }
							onOpenTaskRun={ handleOpenTaskRun }
							onStopTaskRun={ handleStopTaskRun }
							onRunTaskDefinition={ ( defId ) => {
								if ( activeProjectId ) {
									handleRunDefinition(
										activeProjectId,
										defId
									);
								}
							} }
							onEditTaskDefinition={ ( def ) =>
								setCreateTaskState( {
									open: true,
									editDef: def,
								} )
							}
							onDeleteTaskDefinition={ ( def ) =>
								setDeletingTask( def )
							}
							onNewTask={ () =>
								setCreateTaskState( {
									open: true,
									editDef: null,
								} )
							}
						/>
					) }
					{ activeView === 'settings' && <SettingsScreen /> }
				</div>
			</div>
		</div>
	);
}
