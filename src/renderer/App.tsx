import React, { useEffect, useRef, useState } from 'react';

import type { ChatMeta, Folder, RecentChat } from '../types';

import { Sidebar, type View } from './components/Sidebar';
import { SidebarToggleIcon } from './components/icons';
import { type PermissionRequest } from './components/PermissionPrompt';
import { ProjectsScreen } from './components/screens/ProjectsScreen';
import {
	ProjectScreen,
	type AssistantMessage,
	type Message,
	type UserMessage,
} from './components/screens/ProjectScreen';
import { CreateProjectModal } from './components/CreateProjectModal';
import { SearchModal } from './components/SearchModal';

function chatKey( folderId: string, chatId: string ): string {
	return `${ folderId }:${ chatId }`;
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
	const [ chatsByFolder, setChatsByFolder ] = useState<
		Record< string, ChatMeta[] >
	>( {} );
	const [ activeChatIdByFolder, setActiveChatIdByFolder ] = useState<
		Record< string, string >
	>( {} );
	const [ busyFolders, setBusyFolders ] = useState<
		Record< string, boolean >
	>( {} );
	const [ permissions, setPermissions ] = useState< PermissionRequest[] >(
		[]
	);
	const [ sidebarOpen, setSidebarOpen ] = useState( true );
	const [ folders, setFolders ] = useState< Folder[] >( [] );
	const [ activeFolderId, setActiveFolderId ] = useState< string | null >(
		null
	);
	const [ activeView, setActiveView ] = useState< View >( 'projects' );
	const [ createProjectOpen, setCreateProjectOpen ] = useState( false );
	const [ searchOpen, setSearchOpen ] = useState( false );
	const [ recentChats, setRecentChats ] = useState< RecentChat[] >( [] );

	const refreshRecent = (): void => {
		void window.api.chats.recent().then( setRecentChats );
	};

	const handleSelectFolder = ( id: string ): void => {
		setActiveFolderId( id );
		setActiveView( 'project' );
	};

	const handleSelectRecent = ( folderId: string, chatId: string ): void => {
		setActiveFolderId( folderId );
		setActiveView( 'project' );
		setActiveChatIdByFolder( ( prev ) => ( {
			...prev,
			[ folderId ]: chatId,
		} ) );
	};

	const handleProjectCreated = ( folder: Folder ): void => {
		setFolders( ( prev ) =>
			prev.some( ( f ) => f.id === folder.id )
				? prev
				: [ ...prev, folder ]
		);
		setActiveFolderId( folder.id );
		setActiveView( 'project' );
	};

	const activeChatId = activeFolderId
		? activeChatIdByFolder[ activeFolderId ] ?? null
		: null;
	const activeKey =
		activeFolderId && activeChatId
			? chatKey( activeFolderId, activeChatId )
			: null;
	const messages = activeKey ? messagesByChat[ activeKey ] ?? [] : [];
	const activeFolderChats = activeFolderId
		? chatsByFolder[ activeFolderId ] ?? []
		: [];

	const toggleSidebar = (): void => setSidebarOpen( ( v ) => ! v );

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
		( window as unknown as { __cs: typeof api } ).__cs = api;
		return () => {
			delete ( window as unknown as { __cs?: typeof api } ).__cs;
		};
	}, [] );

	useEffect( () => {
		void window.api.folders.list().then( ( list ) => {
			setFolders( list );
			setActiveFolderId( ( prev ) => prev ?? list[ 0 ]?.id ?? null );
			// If there's a folder to auto-enter, land the user in the
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

	// Hydrate the folder's chat list on first activation in this session.
	// If the folder has zero chats, auto-create one so the composer stays
	// immediately usable.
	const fetchedChatListsRef = useRef( new Set< string >() );
	useEffect( () => {
		if ( ! activeFolderId ) {
			return;
		}
		if ( fetchedChatListsRef.current.has( activeFolderId ) ) {
			return;
		}
		fetchedChatListsRef.current.add( activeFolderId );
		const folderId = activeFolderId;
		void ( async () => {
			let chats = await window.api.chats.list( folderId );
			if ( chats.length === 0 ) {
				const created = await window.api.chats.create( folderId, {
					kind: 'general',
				} );
				if ( created ) {
					chats = [ created ];
				}
			}
			setChatsByFolder( ( prev ) => ( {
				...prev,
				[ folderId ]: chats,
			} ) );
			setActiveChatIdByFolder( ( prev ) => {
				if ( prev[ folderId ] ) {
					return prev;
				}
				const pick = pickDefaultChatId( chats );
				if ( ! pick ) {
					return prev;
				}
				return { ...prev, [ folderId ]: pick };
			} );
		} )();
	}, [ activeFolderId ] );

	// Hydrate a chat's transcript from disk the first time it becomes active.
	useEffect( () => {
		if ( ! activeFolderId || ! activeChatId ) {
			return;
		}
		const key = chatKey( activeFolderId, activeChatId );
		if ( messagesByChat[ key ] !== undefined ) {
			return;
		}
		void window.api.chats
			.load( activeFolderId, activeChatId )
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
	}, [ activeFolderId, activeChatId, messagesByChat ] );

	// Each folder with a send in flight tracks its current chat + assistant
	// message id, so events from parallel runs route to the right transcript
	// even when the user has switched folders or chats mid-stream.
	const streamsByFolderRef = useRef<
		Record< string, { chatId: string; msgId: string } >
	>( {} );

	const updateChatMessages = (
		folderId: string,
		chatId: string,
		updater: ( list: Message[] ) => Message[]
	): void => {
		const key = chatKey( folderId, chatId );
		setMessagesByChat( ( prev ) => ( {
			...prev,
			[ key ]: updater( prev[ key ] ?? [] ),
		} ) );
	};

	useEffect( () => {
		const off = window.api.chat.onEvent( ( event ) => {
			const folderId = event.folderId;
			const stream = streamsByFolderRef.current[ folderId ];
			switch ( event.kind ) {
				case 'text-delta': {
					if ( ! stream ) {
						return;
					}
					updateChatMessages( folderId, stream.chatId, ( list ) =>
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
					updateChatMessages( folderId, stream.chatId, ( list ) => [
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
					updateChatMessages( folderId, stream.chatId, ( list ) =>
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
							folderId: event.folderId,
							toolName: event.toolName,
							input: event.input,
						},
					] );
					return;
				case 'done': {
					delete streamsByFolderRef.current[ folderId ];
					setBusyFolders( ( prev ) => {
						if ( ! prev[ folderId ] ) {
							return prev;
						}
						const next = { ...prev };
						delete next[ folderId ];
						return next;
					} );
					refreshRecent();
					if ( ! stream ) {
						return;
					}
					updateChatMessages( folderId, stream.chatId, ( list ) =>
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
					updateChatMessages( folderId, stream.chatId, ( list ) =>
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
			void window.api.permission.respond(
				requestId,
				target.folderId,
				decision,
				remember
			);
		}
	};

	const sendMessage = async (
		text: string,
		folderId: string,
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
		streamsByFolderRef.current[ folderId ] = {
			chatId,
			msgId: assistantMsg.id,
		};
		updateChatMessages( folderId, chatId, ( list ) => [
			...list,
			userMsg,
			assistantMsg,
		] );
		setBusyFolders( ( prev ) => ( { ...prev, [ folderId ]: true } ) );
		try {
			await window.api.chat.send( text, folderId, chatId );
		} catch ( err ) {
			const message = err instanceof Error ? err.message : String( err );
			const stream = streamsByFolderRef.current[ folderId ];
			delete streamsByFolderRef.current[ folderId ];
			if ( stream ) {
				updateChatMessages( folderId, stream.chatId, ( list ) =>
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
			setBusyFolders( ( prev ) => {
				if ( ! prev[ folderId ] ) {
					return prev;
				}
				const next = { ...prev };
				delete next[ folderId ];
				return next;
			} );
		}
	};

	const onSend = async (): Promise< void > => {
		const text = input.trim();
		const folderId = activeFolderId;
		const chatId = activeChatId;
		if ( ! text || ! folderId || ! chatId || busyFolders[ folderId ] ) {
			return;
		}
		setInput( '' );
		await sendMessage( text, folderId, chatId );
	};

	const startStarterChat = async (
		name: 'ideas' | 'draft'
	): Promise< void > => {
		if ( ! activeFolderId || busyFolders[ activeFolderId ] ) {
			return;
		}
		const folderId = activeFolderId;
		const [ prompt, chat ] = await Promise.all( [
			window.api.prompts.get( name, folderId ),
			window.api.chats.create( folderId, {
				kind: name,
				title: name === 'ideas' ? 'Ideas' : 'Draft',
			} ),
		] );
		if ( ! chat ) {
			return;
		}
		setChatsByFolder( ( prev ) => ( {
			...prev,
			[ folderId ]: [ ...( prev[ folderId ] ?? [] ), chat ],
		} ) );
		setActiveChatIdByFolder( ( prev ) => ( {
			...prev,
			[ folderId ]: chat.id,
		} ) );
		// Initialize the message cache so the hydration effect's guard skips
		// the load (the chat's jsonl doesn't exist yet) and doesn't clobber
		// the messages sendMessage is about to append.
		setMessagesByChat( ( prev ) => ( {
			...prev,
			[ chatKey( folderId, chat.id ) ]: [],
		} ) );
		await sendMessage( prompt.trim(), folderId, chat.id );
	};

	const onNewChat = async (): Promise< void > => {
		if ( ! activeFolderId || busyFolders[ activeFolderId ] ) {
			return;
		}
		const folderId = activeFolderId;
		const created = await window.api.chats.create( folderId, {
			kind: 'general',
		} );
		if ( ! created ) {
			return;
		}
		setChatsByFolder( ( prev ) => ( {
			...prev,
			[ folderId ]: [ ...( prev[ folderId ] ?? [] ), created ],
		} ) );
		setActiveChatIdByFolder( ( prev ) => ( {
			...prev,
			[ folderId ]: created.id,
		} ) );
		setMessagesByChat( ( prev ) => ( {
			...prev,
			[ chatKey( folderId, created.id ) ]: [],
		} ) );
	};

	const onSelectChat = ( chatId: string ): void => {
		if ( ! activeFolderId ) {
			return;
		}
		setActiveChatIdByFolder( ( prev ) => ( {
			...prev,
			[ activeFolderId ]: chatId,
		} ) );
	};

	const activeBusy = activeFolderId
		? Boolean( busyFolders[ activeFolderId ] )
		: false;
	const activePermissions = activeFolderId
		? permissions.filter( ( p ) => p.folderId === activeFolderId )
		: [];

	return (
		<div
			className="app"
			data-sidebar-open={ sidebarOpen ? 'true' : 'false' }
		>
			<Sidebar
				isOpen={ sidebarOpen }
				onToggle={ toggleSidebar }
				onLinkFolder={ () => setCreateProjectOpen( true ) }
				onSearch={ () => setSearchOpen( true ) }
				recentChats={ recentChats }
				activeFolderId={ activeFolderId }
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
				folders={ folders }
				onSelect={ handleSelectFolder }
			/>

			<div className="main">
				<header className="main-top" data-testid="titlebar">
					<button
						type="button"
						className="sidebar-icon-btn main-top-toggle"
						data-testid="sidebar-toggle-main"
						aria-label="Show sidebar"
						title="Show sidebar"
						onClick={ toggleSidebar }
						tabIndex={ sidebarOpen ? -1 : 0 }
						aria-hidden={ sidebarOpen ? true : undefined }
					>
						<SidebarToggleIcon />
					</button>
				</header>

				{ activeView === 'projects' && (
					<ProjectsScreen
						folders={ folders }
						onSelect={ handleSelectFolder }
						onCreate={ () => setCreateProjectOpen( true ) }
					/>
				) }
				{ activeView === 'project' && (
					<ProjectScreen
						activeFolderId={ activeFolderId }
						activeChatId={ activeChatId }
						chats={ activeFolderChats }
						messages={ messages }
						permissions={ activePermissions }
						input={ input }
						busy={ activeBusy }
						onInputChange={ setInput }
						onSelectChat={ onSelectChat }
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
	);
}
