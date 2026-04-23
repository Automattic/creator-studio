import React, { useEffect, useRef, useState } from 'react';

import { Sidebar, type Folder } from './components/Sidebar';
import { SidebarToggleIcon } from './components/icons';
import { ToolBlock } from './components/ToolBlock';
import {
	PermissionPrompt,
	type PermissionRequest,
} from './components/PermissionPrompt';

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
	const [ messagesByFolder, setMessagesByFolder ] = useState<
		Record< string, Message[] >
	>( {} );
	const [ busy, setBusy ] = useState( false );
	const [ permissions, setPermissions ] = useState< PermissionRequest[] >(
		[]
	);
	const [ sidebarOpen, setSidebarOpen ] = useState( true );
	const [ folders, setFolders ] = useState< Folder[] >( [] );
	const [ activeFolderId, setActiveFolderId ] = useState< string | null >(
		null
	);

	const messages = activeFolderId
		? messagesByFolder[ activeFolderId ] ?? []
		: [];

	const toggleSidebar = (): void => setSidebarOpen( ( v ) => ! v );

	useEffect( () => {
		void window.api.folders.list().then( ( list ) => {
			setFolders( list );
			setActiveFolderId( ( prev ) => prev ?? list[ 0 ]?.id ?? null );
		} );
	}, [] );

	// Hydrate transcript from disk the first time each folder becomes active
	// in this session.
	useEffect( () => {
		if ( ! activeFolderId ) {
			return;
		}
		if ( messagesByFolder[ activeFolderId ] !== undefined ) {
			return;
		}
		void window.api.chats
			.load( activeFolderId, 'default' )
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
				setMessagesByFolder( ( prev ) =>
					prev[ activeFolderId ] === undefined
						? { ...prev, [ activeFolderId ]: restored }
						: prev
				);
			} );
	}, [ activeFolderId, messagesByFolder ] );

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

	// Tracks the folder/message pair the current stream belongs to, so that
	// events routed from the SDK land in the right transcript even if the
	// user switches folders mid-stream.
	const activeStreamRef = useRef< {
		folderId: string;
		msgId: string;
	} | null >( null );

	const updateFolderMessages = (
		folderId: string,
		updater: ( list: Message[] ) => Message[]
	): void =>
		setMessagesByFolder( ( prev ) => ( {
			...prev,
			[ folderId ]: updater( prev[ folderId ] ?? [] ),
		} ) );

	useEffect( () => {
		const off = window.api.chat.onEvent( ( event ) => {
			const stream = activeStreamRef.current;
			switch ( event.kind ) {
				case 'text-delta': {
					if ( ! stream ) {
						return;
					}
					updateFolderMessages( stream.folderId, ( list ) =>
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
					updateFolderMessages( stream.folderId, ( list ) => [
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
					updateFolderMessages( stream.folderId, ( list ) =>
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
							toolName: event.toolName,
							input: event.input,
						},
					] );
					return;
				case 'done': {
					activeStreamRef.current = null;
					setBusy( false );
					if ( ! stream ) {
						return;
					}
					updateFolderMessages( stream.folderId, ( list ) =>
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
					updateFolderMessages( stream.folderId, ( list ) =>
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
		setPermissions( ( prev ) =>
			prev.filter( ( p ) => p.requestId !== requestId )
		);
		void window.api.permission.respond( requestId, decision, remember );
	};

	const onSend = async (): Promise< void > => {
		const text = input.trim();
		const folderId = activeFolderId;
		if ( ! text || busy || ! folderId ) {
			return;
		}
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
		activeStreamRef.current = {
			folderId,
			msgId: assistantMsg.id,
		};
		updateFolderMessages( folderId, ( list ) => [
			...list,
			userMsg,
			assistantMsg,
		] );
		setInput( '' );
		setBusy( true );
		try {
			await window.api.chat.send( text, folderId );
		} catch ( err ) {
			const message = err instanceof Error ? err.message : String( err );
			const stream = activeStreamRef.current;
			activeStreamRef.current = null;
			if ( stream ) {
				updateFolderMessages( stream.folderId, ( list ) =>
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
			setBusy( false );
		}
	};

	const composerDisabled =
		busy ||
		input.trim().length === 0 ||
		permissions.length > 0 ||
		! activeFolderId;
	const inputDisabled = busy || permissions.length > 0 || ! activeFolderId;

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

				{ permissions.length > 0 && (
					<PermissionPrompt
						request={ permissions[ 0 ] }
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
						{ busy ? 'Sending…' : 'Send' }
					</button>
				</div>
			</div>
		</div>
	);
}
