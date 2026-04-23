import React, { useEffect, useRef, useState } from 'react';

import { Sidebar } from './components/Sidebar';
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
	const [ messages, setMessages ] = useState< Message[] >( [] );
	const [ busy, setBusy ] = useState( false );
	const [ permissions, setPermissions ] = useState< PermissionRequest[] >(
		[]
	);
	const [ sidebarOpen, setSidebarOpen ] = useState( true );

	const toggleSidebar = (): void => setSidebarOpen( ( v ) => ! v );

	const streamingIdRef = useRef< string | null >( null );

	useEffect( () => {
		const off = window.api.chat.onEvent( ( event ) => {
			switch ( event.kind ) {
				case 'text-delta': {
					const id = streamingIdRef.current;
					if ( ! id ) {
						return;
					}
					setMessages( ( prev ) =>
						prev.map( ( m ) =>
							m.kind === 'assistant' && m.id === id
								? { ...m, text: m.text + event.text }
								: m
						)
					);
					return;
				}
				case 'tool-use-start':
					setMessages( ( prev ) => [
						...prev,
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
					setMessages( ( prev ) =>
						prev.map( ( m ) =>
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
					const id = streamingIdRef.current;
					streamingIdRef.current = null;
					setBusy( false );
					if ( ! id ) {
						return;
					}
					setMessages( ( prev ) =>
						prev.map( ( m ) =>
							m.kind === 'assistant' && m.id === id
								? { ...m, streaming: false }
								: m
						)
					);
					return;
				}
				case 'error': {
					const id = streamingIdRef.current;
					if ( ! id ) {
						return;
					}
					setMessages( ( prev ) =>
						prev.map( ( m ) =>
							m.kind === 'assistant' && m.id === id
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
		if ( ! text || busy ) {
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
		streamingIdRef.current = assistantMsg.id;
		setMessages( ( prev ) => [ ...prev, userMsg, assistantMsg ] );
		setInput( '' );
		setBusy( true );
		try {
			await window.api.chat.send( text );
		} catch ( err ) {
			const message = err instanceof Error ? err.message : String( err );
			const id = streamingIdRef.current;
			streamingIdRef.current = null;
			setMessages( ( prev ) =>
				prev.map( ( m ) =>
					m.kind === 'assistant' && m.id === id
						? {
								...m,
								text: `Error: ${ message }`,
								streaming: false,
								errored: true,
						  }
						: m
				)
			);
			setBusy( false );
		}
	};

	const composerDisabled =
		busy || input.trim().length === 0 || permissions.length > 0;
	const inputDisabled = busy || permissions.length > 0;

	return (
		<div
			className="app"
			data-sidebar-open={ sidebarOpen ? 'true' : 'false' }
		>
			<Sidebar
				isOpen={ sidebarOpen }
				onToggle={ toggleSidebar }
				onLinkFolder={ () => {
					// Wired in a later step.
					// eslint-disable-next-line no-console
					console.log( 'Link folder' );
				} }
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
						placeholder="Message Creators Studio…"
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
