import React, { useEffect, useRef, useState } from 'react';

import { CHAT_ACTIONS, type ChatActionId } from '../chat-actions';
import type { ChatMeta, Project, RecentChat } from '../types';

import { Sidebar, type View } from './components/Sidebar';
import { TopActions } from './components/TopActions';
import { type PermissionRequest } from './components/PermissionPrompt';
import { ResourcesPanelToggleIcon } from './icons';
import { DraftsScreen } from './screens/DraftsScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import {
	ProjectScreen,
	type AssistantMessage,
	type Message,
	type UserMessage,
} from './screens/ProjectScreen';
import { CreateProjectModal } from './components/CreateProjectModal';
import { SearchModal } from './components/SearchModal';

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

export function App(): React.ReactElement {
	const [ input, setInput ] = useState( '' );
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
	const [ previewedDraftByProject, setPreviewedDraftByProject ] = useState<
		Record< string, { relPath: string; name: string } >
	>( {} );
	const [ sidebarOpen, setSidebarOpen ] = useState( true );
	const [ resourcesOpen, setResourcesOpen ] = useState( true );
	const [ projects, setProjects ] = useState< Project[] >( [] );
	const [ activeProjectId, setActiveProjectId ] = useState< string | null >(
		null
	);
	const [ activeView, setActiveView ] = useState< View >( 'projects' );
	const [ createProjectOpen, setCreateProjectOpen ] = useState( false );
	const [ searchOpen, setSearchOpen ] = useState( false );
	const [ recentChats, setRecentChats ] = useState< RecentChat[] >( [] );

	const refreshRecent = (): void => {
		void window.api.chats.recent().then( setRecentChats );
	};

	const handleSelectProject = ( id: string ): void => {
		setActiveProjectId( id );
		setActiveView( 'project' );
	};

	const handleSelectRecent = ( projectId: string, chatId: string ): void => {
		setActiveProjectId( projectId );
		setActiveView( 'project' );
		setActiveChatIdByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: chatId,
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
	const activeProject = activeProjectId
		? projects.find( ( p ) => p.id === activeProjectId ) ?? null
		: null;
	const activeKey =
		activeProjectId && activeChatId
			? chatKey( activeProjectId, activeChatId )
			: null;
	const messages = activeKey ? messagesByChat[ activeKey ] ?? [] : [];
	const activeProjectChats = activeProjectId
		? chatsByProject[ activeProjectId ] ?? []
		: [];
	const activeProjectClosedChatIds = activeProjectId
		? closedChatIdsByProject[ activeProjectId ] ?? []
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
		void window.api.uiPrefs.get().then( ( prefs ) => {
			setResourcesOpen( prefs.resourcesPanelOpen );
		} );
	}, [] );

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
	// immediately usable.
	const fetchedChatListsRef = useRef( new Set< string >() );
	useEffect( () => {
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
				const pick = pickDefaultChatId( chats );
				if ( ! pick ) {
					return prev;
				}
				return { ...prev, [ projectId ]: pick };
			} );
		} )();
	}, [ activeProjectId ] );

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
						return { kind: 'user', id: p.id, text: p.text };
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
		chatId: string
	): Promise< void > => {
		const key = chatKey( projectId, chatId );
		const userMsg: UserMessage = {
			kind: 'user',
			id: nextId(),
			text,
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
			await window.api.agent.send( text, projectId, chatId );
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

	const onSend = async (): Promise< void > => {
		const text = input.trim();
		const projectId = activeProjectId;
		const chatId = activeChatId;
		if ( ! text || ! projectId || ! chatId ) {
			return;
		}
		if ( busyChats[ chatKey( projectId, chatId ) ] ) {
			return;
		}
		setInput( '' );
		await sendMessage( text, projectId, chatId );
	};

	const startStarterChat = async ( name: ChatActionId ): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const action = CHAT_ACTIONS.find( ( a ) => a.id === name );
		if ( ! action ) {
			return;
		}
		const projectId = activeProjectId;
		const [ prompt, chat ] = await Promise.all( [
			window.api.prompt.get( name, projectId ),
			window.api.chat.create( projectId, {
				title: action.chatTitle,
			} ),
		] );
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
		// Initialize the message cache so the hydration effect's guard skips
		// the load (the chat's jsonl doesn't exist yet) and doesn't clobber
		// the messages sendMessage is about to append.
		setMessagesByChat( ( prev ) => ( {
			...prev,
			[ chatKey( projectId, chat.id ) ]: [],
		} ) );
		await sendMessage( prompt.trim(), projectId, chat.id );
	};

	const stripExtension = ( name: string ): string => {
		const dot = name.lastIndexOf( '.' );
		return dot > 0 ? name.slice( 0, dot ) : name;
	};

	const handleOpenDraft = async (
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
		// Always show the preview immediately — independent of whether we
		// reuse or create. Switching back to the grid is the Back button's
		// job.
		setPreviewedDraftByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: { relPath, name },
		} ) );

		const existing = ( chatsByProject[ projectId ] ?? [] ).find(
			( c ) => c.draftPath === relPath
		);
		if ( existing ) {
			setActiveChatIdByProject( ( prev ) => ( {
				...prev,
				[ projectId ]: existing.id,
			} ) );
			setClosedChatIdsByProject( ( prev ) => {
				const list = prev[ projectId ] ?? [];
				if ( ! list.includes( existing.id ) ) {
					return prev;
				}
				return {
					...prev,
					[ projectId ]: list.filter( ( id ) => id !== existing.id ),
				};
			} );
			return;
		}

		// Mirror startStarterChat: fetch the prompt and create the chat in
		// parallel, then seed the message cache before sending so the
		// hydration effect doesn't race.
		const absoluteFilePath = `${ project.path }/drafts/${ relPath }`;
		const [ prompt, chat ] = await Promise.all( [
			window.api.prompt.get(
				'discuss-draft',
				projectId,
				absoluteFilePath
			),
			window.api.chat.create( projectId, {
				title: stripExtension( name ),
				draftPath: relPath,
			} ),
		] );
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
		await sendMessage( prompt.trim(), projectId, chat.id );
	};

	const handleClosePreview = (): void => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		setPreviewedDraftByProject( ( prev ) => {
			if ( ! ( projectId in prev ) ) {
				return prev;
			}
			const next = { ...prev };
			delete next[ projectId ];
			return next;
		} );
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

	const onCloseChat = ( chatId: string ): void => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const allChats = chatsByProject[ projectId ] ?? [];
		const alreadyClosed = closedChatIdsByProject[ projectId ] ?? [];
		const remaining = allChats.filter(
			( c ) => c.id !== chatId && ! alreadyClosed.includes( c.id )
		);
		setClosedChatIdsByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: [ ...( prev[ projectId ] ?? [] ), chatId ],
		} ) );
		const wasActive = activeChatIdByProject[ projectId ] === chatId;
		if ( wasActive ) {
			const next = pickDefaultChatId( remaining );
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

	const onRenameChat = async (
		chatId: string,
		title: string
	): Promise< void > => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
		const trimmed = title.trim();
		setChatsByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: ( prev[ projectId ] ?? [] ).map( ( c ) =>
				c.id === chatId ? { ...c, title: trimmed } : c
			),
		} ) );
		await window.api.chat.rename( projectId, chatId, trimmed );
		refreshRecent();
	};

	const onOpenChat = ( chatId: string ): void => {
		if ( ! activeProjectId ) {
			return;
		}
		const projectId = activeProjectId;
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
		setActiveChatIdByProject( ( prev ) => ( {
			...prev,
			[ projectId ]: chatId,
		} ) );
	};

	const activeBusy =
		activeKey !== null ? Boolean( busyChats[ activeKey ] ) : false;
	const activeRunningChatIds = activeProjectId
		? activeProjectChats
				.filter(
					( c ) => busyChats[ chatKey( activeProjectId, c.id ) ]
				)
				.map( ( c ) => c.id )
		: [];
	const activePermissions = activeProjectId
		? permissions.filter( ( p ) => p.projectId === activeProjectId )
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

	return (
		<div
			className="app"
			data-sidebar-open={ sidebarOpen ? 'true' : 'false' }
		>
			<Sidebar
				isOpen={ sidebarOpen }
				onToggle={ toggleSidebar }
				onLinkProject={ () => setCreateProjectOpen( true ) }
				onSearch={ () => setSearchOpen( true ) }
				recentChats={ recentChats }
				activeProjectId={ activeProjectId }
				activeChatId={ activeChatId }
				onSelectRecent={ handleSelectRecent }
				activeView={ activeView }
				onSelectView={ setActiveView }
			/>

			<CreateProjectModal
				open={ createProjectOpen }
				onClose={ () => setCreateProjectOpen( false ) }
				onCreated={ handleProjectCreated }
			/>

			<SearchModal
				open={ searchOpen }
				onClose={ () => setSearchOpen( false ) }
				projects={ projects }
				onSelect={ handleSelectProject }
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
							<h1
								className="main-top-title"
								data-testid="project-title"
							>
								{ activeProject?.name ?? 'Project' }
							</h1>
							<div
								className="main-top-actions"
								data-testid="transcript-actions"
							>
								<button
									type="button"
									className="project-screen-action-btn"
									data-testid="chat-draft"
									disabled
								>
									New draft
								</button>
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
				</div>
				<div className="workspace" data-testid="workspace">
					{ activeView === 'projects' && (
						<ProjectsScreen
							projects={ projects }
							onSelect={ handleSelectProject }
							onCreate={ () => setCreateProjectOpen( true ) }
						/>
					) }
					{ activeView === 'drafts' && (
						<DraftsScreen onSelectProject={ handleSelectProject } />
					) }
					{ activeView === 'project' && (
						<ProjectScreen
							activeProjectId={ activeProjectId }
							resourcesOpen={ resourcesOpen }
							activeChatId={ activeChatId }
							runningChatIds={ activeRunningChatIds }
							chats={ activeProjectChats }
							closedChatIds={ activeProjectClosedChatIds }
							messages={ messages }
							permissions={ activePermissions }
							input={ input }
							busy={ activeBusy }
							previewedDraft={
								activeProjectId
									? previewedDraftByProject[
											activeProjectId
									  ] ?? null
									: null
							}
							onInputChange={ setInput }
							onSelectChat={ onSelectChat }
							onCloseChat={ onCloseChat }
							onCancelChat={ onCancelChat }
							onOpenChat={ onOpenChat }
							onDeleteChat={ ( chatId ) => {
								void onDeleteChat( chatId );
							} }
							onRenameChat={ ( chatId, title ) => {
								void onRenameChat( chatId, title );
							} }
							onNewChat={ () => {
								void onNewChat();
							} }
							onStartStarterChat={ ( kind ) => {
								void startStarterChat( kind );
							} }
							onSend={ () => {
								void onSend();
							} }
							onOpenDraft={ ( relPath, name ) => {
								void handleOpenDraft( relPath, name );
							} }
							onClosePreview={ handleClosePreview }
							onPermissionDecision={ onDecision }
						/>
					) }
				</div>
			</div>
		</div>
	);
}
