import React, { useEffect, useRef, useState } from 'react';

import type { ChatMeta, PersistedMessage } from '../../types';
import { ChatComposer } from './ChatComposer';
import {
	ChatTranscript,
	type AssistantMessage,
	type ChatMessage,
	type UserMessage,
} from './ChatTranscript';
import { PermissionPrompt, type PermissionRequest } from './PermissionPrompt';

type Props = {
	projectId: string;
	relPath: string;
};

let counter = 0;
const nextId = (): string => `dm${ ++counter }`;

function fromPersisted( persisted: PersistedMessage[] ): ChatMessage[] {
	return persisted.map( ( p ) => {
		if ( p.kind === 'user' ) {
			return {
				kind: 'user',
				id: p.id,
				text: p.text,
				attachments: p.attachments,
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
}

export function DraftChatPanel( {
	projectId,
	relPath,
}: Props ): React.ReactElement {
	const [ chat, setChat ] = useState< ChatMeta | null >( null );
	const [ messages, setMessages ] = useState< ChatMessage[] >( [] );
	const [ input, setInput ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const [ permissions, setPermissions ] = useState< PermissionRequest[] >(
		[]
	);

	// One in-flight assistant bubble id, mirrored in a ref so the event
	// listener (registered with empty deps) can read the latest value.
	const streamRef = useRef< { msgId: string } | null >( null );
	const chatIdRef = useRef< string | null >( null );

	// Resolve chat for this draft + load history when the draft changes.
	useEffect( () => {
		let cancelled = false;
		setChat( null );
		setMessages( [] );
		setInput( '' );
		setBusy( false );
		setPermissions( [] );
		streamRef.current = null;
		chatIdRef.current = null;
		void window.api.chat
			.ensureForDraft( projectId, relPath )
			.then( async ( meta ) => {
				if ( cancelled ) {
					return;
				}
				setChat( meta );
				chatIdRef.current = meta.id;
				const persisted = await window.api.chat.load(
					projectId,
					meta.id
				);
				if ( cancelled ) {
					return;
				}
				setMessages( fromPersisted( persisted ) );
			} )
			.catch( ( err ) => {
				// eslint-disable-next-line no-console
				console.error( 'draft-chat ensureForDraft failed', err );
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId, relPath ] );

	// Subscribe to agent events. Filter by our active chatId so events for
	// other chats (project chats, other drafts) don't bleed in.
	useEffect( () => {
		const off = window.api.agent.onEvent( ( event ) => {
			if ( event.chatId !== chatIdRef.current ) {
				return;
			}
			const stream = streamRef.current;
			switch ( event.kind ) {
				case 'text-delta': {
					if ( ! stream ) {
						return;
					}
					setMessages( ( list ) =>
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
					setMessages( ( list ) => [
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
					setMessages( ( list ) =>
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
					streamRef.current = null;
					setBusy( false );
					if ( ! stream ) {
						return;
					}
					setMessages( ( list ) =>
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
				case 'error': {
					if ( ! stream ) {
						return;
					}
					setMessages( ( list ) =>
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

	const handleSend = async (): Promise< void > => {
		const text = input.trim();
		if ( ! text || ! chat || busy ) {
			return;
		}
		const userMsg: UserMessage = {
			kind: 'user',
			id: nextId(),
			text,
			attachments: [],
		};
		const assistantMsg: AssistantMessage = {
			kind: 'assistant',
			id: nextId(),
			text: '',
			streaming: true,
		};
		streamRef.current = { msgId: assistantMsg.id };
		setMessages( ( list ) => [ ...list, userMsg, assistantMsg ] );
		setInput( '' );
		setBusy( true );
		try {
			await window.api.agent.send( text, projectId, chat.id, {
				userMessageText: text,
				attachments: [],
			} );
		} catch ( err ) {
			const message = err instanceof Error ? err.message : String( err );
			const stream = streamRef.current;
			streamRef.current = null;
			setBusy( false );
			if ( stream ) {
				setMessages( ( list ) =>
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
		}
	};

	const handleCancel = (): void => {
		if ( ! chat ) {
			return;
		}
		void window.api.agent.cancel( projectId, chat.id );
	};

	const handlePermissionDecision = (
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

	const ready = chat !== null;
	return (
		<div className="draft-chat-panel" data-testid="draft-chat-panel">
			<ChatTranscript
				messages={ messages }
				testId="draft-chat-transcript"
			/>
			{ permissions.length > 0 && (
				<PermissionPrompt
					request={ permissions[ 0 ] }
					onDecision={ handlePermissionDecision }
				/>
			) }
			<ChatComposer
				value={ input }
				onChange={ setInput }
				onSend={ handleSend }
				onCancel={ ready ? handleCancel : undefined }
				busy={ busy }
				disabled={ ! ready || permissions.length > 0 }
				placeholder="Ask for an edit on this draft…"
				testIds={ {
					root: 'draft-chat-composer',
					input: 'draft-chat-input',
					send: 'draft-chat-send',
				} }
			/>
		</div>
	);
}
