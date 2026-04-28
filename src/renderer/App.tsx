import React, { useEffect, useRef, useState } from 'react';

import type { ChatMeta, Project, RecentChat } from '../types';

import { Sidebar, type View } from './components/Sidebar';
import { TopActions } from './components/TopActions';
import { type PermissionRequest } from './components/PermissionPrompt';
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
	const [ busyProjects, setBusyProjects ] = useState<
		Record< string, boolean >
	>( {} );
	const [ permissions, setPermissions ] = useState< PermissionRequest[] >(
		[]
	);
	const [ sidebarOpen, setSidebarOpen ] = useState( true );
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

	useEffect( () => {
		const handler = ( e: KeyboardEvent ): void => {
			if ( e.key === 'b' && ( e.metaKey || e.ctrlKey ) ) {
				e.preventDefault();
				toggleSidebar();
			}
		};
		window.addEventListener( 'keydown', handler );
		return () => window.removeEventListener( 'keydown', handler );
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
				const created = await window.api.chat.create( projectId, {
					kind: 'general',
				} );
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

	// Each project with a send in flight tracks its current chat + assistant
	// message id, so events from parallel runs route to the right transcript
	// even when the user has switched projects or chats mid-stream.
	const streamsByProjectRef = useRef<
		Record< string, { chatId: string; msgId: string } >
	>( {} );

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
			const stream = streamsByProjectRef.current[ projectId ];
			switch ( event.kind ) {
				case 'text-delta': {
					if ( ! stream ) {
						return;
					}
					updateChatMessages( projectId, stream.chatId, ( list ) =>
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
					updateChatMessages( projectId, stream.chatId, ( list ) => [
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
					updateChatMessages( projectId, stream.chatId, ( list ) =>
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
							toolName: event.toolName,
							input: event.input,
						},
					] );
					return;
				case 'done': {
					delete streamsByProjectRef.current[ projectId ];
					setBusyProjects( ( prev ) => {
						if ( ! prev[ projectId ] ) {
							return prev;
						}
						const next = { ...prev };
						delete next[ projectId ];
						return next;
					} );
					refreshRecent();
					if ( ! stream ) {
						return;
					}
					updateChatMessages( projectId, stream.chatId, ( list ) =>
						list.map( ( m ) =>
							m.kind === 'assistant' && m.id === stream.msgId
								? { ...m, streaming: false }
								: m
						)
					);
					return;
				}
				case 'error': {
					if ( ! stream ) {
						return;
					}
					updateChatMessages( projectId, stream.chatId, ( list ) =>
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
		streamsByProjectRef.current[ projectId ] = {
			chatId,
			msgId: assistantMsg.id,
		};
		updateChatMessages( projectId, chatId, ( list ) => [
			...list,
			userMsg,
			assistantMsg,
		] );
		setBusyProjects( ( prev ) => ( { ...prev, [ projectId ]: true } ) );
		try {
			await window.api.agent.send( text, projectId, chatId );
		} catch ( err ) {
			const message = err instanceof Error ? err.message : String( err );
			const stream = streamsByProjectRef.current[ projectId ];
			delete streamsByProjectRef.current[ projectId ];
			if ( stream ) {
				updateChatMessages( projectId, stream.chatId, ( list ) =>
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
			setBusyProjects( ( prev ) => {
				if ( ! prev[ projectId ] ) {
					return prev;
				}
				const next = { ...prev };
				delete next[ projectId ];
				return next;
			} );
		}
	};

	const onSend = async (): Promise< void > => {
		const text = input.trim();
		const projectId = activeProjectId;
		const chatId = activeChatId;
		if ( ! text || ! projectId || ! chatId || busyProjects[ projectId ] ) {
			return;
		}
		setInput( '' );
		await sendMessage( text, projectId, chatId );
	};

	const startStarterChat = async (
		name: 'ideas' | 'draft'
	): Promise< void > => {
		if ( ! activeProjectId || busyProjects[ activeProjectId ] ) {
			return;
		}
		const projectId = activeProjectId;
		const [ prompt, chat ] = await Promise.all( [
			window.api.prompt.get( name, projectId ),
			window.api.chat.create( projectId, {
				kind: name,
				title: name === 'ideas' ? 'Ideas' : 'Draft',
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

	const onNewChat = async (): Promise< void > => {
		if ( ! activeProjectId || busyProjects[ activeProjectId ] ) {
			return;
		}
		const projectId = activeProjectId;
		const created = await window.api.chat.create( projectId, {
			kind: 'general',
		} );
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

	const activeBusy = activeProjectId
		? Boolean( busyProjects[ activeProjectId ] )
		: false;
	const activePermissions = activeProjectId
		? permissions.filter( ( p ) => p.projectId === activeProjectId )
		: [];

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
				</div>
				<div className="workspace" data-testid="workspace">
					{ activeView === 'projects' && (
						<ProjectsScreen
							projects={ projects }
							onSelect={ handleSelectProject }
							onCreate={ () => setCreateProjectOpen( true ) }
						/>
					) }
					{ activeView === 'project' && (
						<ProjectScreen
							activeProjectId={ activeProjectId }
							activeProjectName={ activeProject?.name ?? null }
							activeChatId={ activeChatId }
							chats={ activeProjectChats }
							closedChatIds={ activeProjectClosedChatIds }
							messages={ messages }
							permissions={ activePermissions }
							input={ input }
							busy={ activeBusy }
							onInputChange={ setInput }
							onSelectChat={ onSelectChat }
							onCloseChat={ onCloseChat }
							onOpenChat={ onOpenChat }
							onNewChat={ () => {
								void onNewChat();
							} }
							onStartStarterChat={ ( kind ) => {
								void startStarterChat( kind );
							} }
							onSend={ () => {
								void onSend();
							} }
							onPermissionDecision={ onDecision }
						/>
					) }
				</div>
			</div>
		</div>
	);
}
