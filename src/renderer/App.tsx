import React, { useEffect, useRef, useState } from 'react';

import type { ChatMeta } from '../main/ipc';

import { Sidebar, type Folder } from './components/Sidebar';
import { SidebarToggleIcon } from './components/icons';
import { ToolBlock } from './components/ToolBlock';
import {
	PermissionPrompt,
	type PermissionRequest,
} from './components/PermissionPrompt';

function chatKey( folderId: string, chatId: string ): string {
	return `${ folderId }:${ chatId }`;
}

function computeChatLabels( chats: ChatMeta[] ): Map< string, string > {
	const labels = new Map< string, string >();
	const totalByKind = new Map< ChatMeta[ 'kind' ], number >();
	for ( const c of chats ) {
		totalByKind.set( c.kind, ( totalByKind.get( c.kind ) ?? 0 ) + 1 );
	}
	const seenByKind = new Map< ChatMeta[ 'kind' ], number >();
	for ( const c of chats ) {
		if ( c.title ) {
			labels.set( c.id, c.title );
			continue;
		}
		const kindBase: Record< ChatMeta[ 'kind' ], string > = {
			general: 'Chat',
			ideas: 'Ideas',
			draft: 'Draft',
		};
		const base = kindBase[ c.kind ];
		const total = totalByKind.get( c.kind ) ?? 1;
		if ( total === 1 ) {
			labels.set( c.id, base );
		} else {
			const idx = ( seenByKind.get( c.kind ) ?? 0 ) + 1;
			seenByKind.set( c.kind, idx );
			labels.set( c.id, `${ base } ${ idx }` );
		}
	}
	return labels;
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

type UserMessage = {
	kind: 'user';
	id: string;
	text: string;
};

type AssistantMessage = {
	kind: 'assistant';
	id: string;
	text: string;
	streaming: boolean;
	errored?: boolean;
};

type ToolMessage = {
	kind: 'tool';
	id: string;
	toolUseId: string;
	toolName: string;
	input: unknown;
	status: 'running' | 'done' | 'error';
	output?: string;
};

type Message = UserMessage | AssistantMessage | ToolMessage;

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
	const chatLabels = computeChatLabels( activeFolderChats );

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
				document.querySelector(
					'[data-testid=permission-prompt]'
				) === null,
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
		} );
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

	const onLinkFolder = async (): Promise< void > => {
		const folder = await window.api.folders.add();
		if ( ! folder ) {
			return;
		}
		setFolders( ( prev ) => {
			const exists = prev.some( ( f ) => f.id === folder.id );
			return exists ? prev : [ ...prev, folder ];
		} );
		setActiveFolderId( folder.id );
	};

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
							m.kind === 'tool' &&
							m.toolUseId === event.toolUseId
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
		if (
			! text ||
			! folderId ||
			! chatId ||
			busyFolders[ folderId ]
		) {
			return;
		}
		setInput( '' );
		await sendMessage( text, folderId, chatId );
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
	const composerDisabled =
		activeBusy ||
		input.trim().length === 0 ||
		activePermissions.length > 0 ||
		! activeFolderId ||
		! activeChatId;
	const inputDisabled =
		activeBusy ||
		activePermissions.length > 0 ||
		! activeFolderId ||
		! activeChatId;
	const actionsDisabled = ! activeFolderId || activeBusy;

	return (
		<div
			className="app"
			data-sidebar-open={ sidebarOpen ? 'true' : 'false' }
		>
			<Sidebar
				isOpen={ sidebarOpen }
				onToggle={ toggleSidebar }
				onLinkFolder={ () => {
					void onLinkFolder();
				} }
				folders={ folders }
				activeFolderId={ activeFolderId }
				onSelectFolder={ setActiveFolderId }
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

				<div
					className="transcript-actions"
					data-testid="transcript-actions"
				>
					<div
						className="transcript-actions-chats"
						data-testid="chat-selector"
					>
						{ activeFolderChats.length === 0 && (
							<span className="transcript-actions-chat-placeholder">
								No chats
							</span>
						) }
						{ activeFolderChats.map( ( chat ) => (
							<button
								key={ chat.id }
								type="button"
								className="chat-tab"
								data-testid={ `chat-tab-${ chat.id }` }
								data-active={
									chat.id === activeChatId ? 'true' : 'false'
								}
								onClick={ () => onSelectChat( chat.id ) }
								title={ chatLabels.get( chat.id ) }
							>
								<span className="chat-tab-label">
									{ chatLabels.get( chat.id ) }
								</span>
							</button>
						) ) }
					</div>
					<div className="transcript-actions-buttons">
						<button
							type="button"
							className="transcript-action-btn"
							data-testid="chat-new"
							onClick={ () => {
								void onNewChat();
							} }
							disabled={ actionsDisabled }
						>
							+ New chat
						</button>
						<button
							type="button"
							className="transcript-action-btn"
							data-testid="chat-ideas"
							onClick={ () => console.log( 'chat-ideas' ) }
							disabled={ actionsDisabled }
						>
							Generate ideas
						</button>
						<button
							type="button"
							className="transcript-action-btn"
							data-testid="chat-draft"
							onClick={ () => console.log( 'chat-draft' ) }
							disabled={ actionsDisabled }
						>
							Generate draft
						</button>
					</div>
				</div>

				<main className="transcript" data-testid="transcript">
					{ messages.map( ( m ) => {
						if ( m.kind === 'user' ) {
							return (
								<div
									key={ m.id }
									className="bubble bubble-user"
									data-testid="bubble-user"
								>
									<div className="bubble-text">
										{ m.text }
									</div>
								</div>
							);
						}
						if ( m.kind === 'assistant' ) {
							return (
								<div
									key={ m.id }
									className={ `bubble bubble-assistant${
										m.errored ? ' bubble-error' : ''
									}` }
									data-testid="bubble-assistant"
									data-streaming={
										m.streaming ? 'true' : 'false'
									}
								>
									<div className="bubble-text">
										{ m.text }
									</div>
								</div>
							);
						}
						return (
							<ToolBlock
								key={ m.id }
								toolName={ m.toolName }
								input={ m.input }
								status={ m.status }
								output={ m.output }
							/>
						);
					} ) }
				</main>

				{ activePermissions.length > 0 && (
					<PermissionPrompt
						request={ activePermissions[ 0 ] }
						onDecision={ onDecision }
					/>
				) }

				<div className="composer" data-testid="composer">
					<textarea
						className="composer-input"
						data-testid="chat-input"
						placeholder={
							activeFolderId
								? 'Message Creators Studio…'
								: 'Link a folder to start chatting'
						}
						rows={ 3 }
						value={ input }
						onChange={ ( e ) => setInput( e.target.value ) }
						disabled={ inputDisabled }
					/>
					<button
						type="button"
						className="composer-send"
						data-testid="send-button"
						onClick={ onSend }
						disabled={ composerDisabled }
					>
						{ activeBusy ? 'Sending…' : 'Send' }
					</button>
				</div>
			</div>
		</div>
	);
}
