import React, { useEffect, useRef, useState } from 'react';

import type { MessageSelection, PersistedMessage } from '../../types';
import { ChatComposer } from './ChatComposer';
import {
	ChatTranscript,
	type AssistantMessage,
	type ChatMessage,
	type UserMessage,
} from './ChatTranscript';
import { PermissionPrompt, type PermissionRequest } from './PermissionPrompt';
import { CloseIcon, SelectionsIcon } from '../icons';

export type AddedSelection = {
	id: string;
	text: string;
	fromLine: number;
	toLine: number;
};

type Props = {
	projectId: string;
	relPath: string;
	chatId: string | null;
	addedSelections: AddedSelection[];
	onClearAddedSelections: () => void;
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
}

export function DraftChatPanel( {
	projectId,
	relPath,
	chatId,
	addedSelections,
	onClearAddedSelections,
}: Props ): React.ReactElement {
	// Mirror in a ref so handleSend (recreated each render) reads the
	// latest list without us having to stuff it into a useCallback dep.
	const addedSelectionsRef = useRef< AddedSelection[] >( addedSelections );
	addedSelectionsRef.current = addedSelections;
	const [ messages, setMessages ] = useState< ChatMessage[] >( [] );
	const [ input, setInput ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const [ permissions, setPermissions ] = useState< PermissionRequest[] >(
		[]
	);

	// One in-flight assistant bubble id, mirrored in a ref so the event
	// listener (registered with empty deps) can read the latest value.
	const streamRef = useRef< { msgId: string } | null >( null );
	const chatIdRef = useRef< string | null >( chatId );
	chatIdRef.current = chatId;

	// Load history when the active chat changes. The parent (DraftSidebar)
	// owns chat resolution — when chatId is null we render an empty,
	// disabled panel.
	useEffect( () => {
		let cancelled = false;
		setMessages( [] );
		setInput( '' );
		setBusy( false );
		setPermissions( [] );
		streamRef.current = null;
		if ( ! chatId ) {
			return () => {
				cancelled = true;
			};
		}
		void window.api.chat
			.load( projectId, chatId )
			.then( ( persisted ) => {
				if ( cancelled ) {
					return;
				}
				setMessages( fromPersisted( persisted ) );
			} )
			.catch( ( err ) => {
				// eslint-disable-next-line no-console
				console.error( 'draft-chat load failed', err );
			} );
		return () => {
			cancelled = true;
		};
	}, [ projectId, chatId ] );

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
		if ( ! text || ! chatId || busy ) {
			return;
		}
		const sels = addedSelectionsRef.current;
		// The agent gets the typed text plus each attached selection inlined
		// with its line range. The user bubble's `text` stays exactly what
		// the user typed — the selection count rides on a separate
		// `selections` field so the bubble can render an indicator without
		// baking it into the markdown.
		const promptForAgent =
			sels.length === 0
				? text
				: [
						`The user has attached ${ sels.length } selection${
							sels.length === 1 ? '' : 's'
						} from the active draft (drafts/${ relPath }):`,
						'',
						...sels.flatMap( ( s, i ) => [
							`[${ i + 1 }] Lines ${ s.fromLine }–${ s.toLine }:`,
							'```',
							s.text,
							'```',
							'',
						] ),
						'Their message:',
						text,
				  ].join( '\n' );
		const messageSelections: MessageSelection[] = sels.map( ( s ) => ( {
			text: s.text,
			fromLine: s.fromLine,
			toLine: s.toLine,
		} ) );
		const userMsg: UserMessage = {
			kind: 'user',
			id: nextId(),
			text,
			attachments: [],
			selections: messageSelections,
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
			await window.api.agent.send( promptForAgent, projectId, chatId, {
				userMessageText: text,
				attachments: [],
				selections: messageSelections,
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
		if ( ! chatId ) {
			return;
		}
		void window.api.agent.cancel( projectId, chatId );
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

	const ready = chatId !== null;
	const selectionsCount = addedSelections.length;
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
			{ selectionsCount > 0 && (
				<div
					className="draft-chat-selection-chip"
					data-testid="draft-chat-selection"
					title={ addedSelections
						.map(
							( s ) =>
								`Lines ${ s.fromLine }–${ s.toLine }:\n${ s.text }`
						)
						.join( '\n\n———\n\n' ) }
				>
					<span
						className="draft-chat-selection-icon"
						aria-hidden="true"
					>
						<SelectionsIcon size={ 14 } />
					</span>
					<span className="draft-chat-selection-label">
						{ selectionsCount === 1
							? '1 selection'
							: `${ selectionsCount } selections` }
					</span>
					<button
						type="button"
						className="draft-chat-selection-clear"
						data-testid="draft-chat-selection-clear"
						aria-label="Remove selections"
						title="Remove selections"
						onClick={ onClearAddedSelections }
					>
						<CloseIcon size={ 10 } />
					</button>
				</div>
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
