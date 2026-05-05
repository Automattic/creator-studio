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
import { CloseIcon } from '../icons';

export type DraftSelection = {
	text: string;
	fromLine: number;
	toLine: number;
};

type Props = {
	projectId: string;
	relPath: string;
	selection: DraftSelection | null;
	onClearSelection: () => void;
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
	selection,
	onClearSelection,
}: Props ): React.ReactElement {
	// Mirror selection in a ref so handleSend (recreated each render) reads
	// the latest value without us having to stuff it into a useCallback dep.
	const selectionRef = useRef< DraftSelection | null >( selection );
	selectionRef.current = selection;
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
		const sel = selectionRef.current;
		// The agent gets a richer prompt with the selection inline; the user
		// bubble keeps just what they typed plus a small "lines L–M" hint so
		// later readers know which selection the message referred to.
		const promptForAgent = sel
			? [
					`The user has selected lines ${ sel.fromLine }–${ sel.toLine } of the active draft (drafts/${ relPath }):`,
					'```',
					sel.text,
					'```',
					'',
					'Their message:',
					text,
			  ].join( '\n' )
			: text;
		const userBubbleText = sel
			? `${ text }\n\n_(referring to lines ${ sel.fromLine }–${ sel.toLine })_`
			: text;
		const userMsg: UserMessage = {
			kind: 'user',
			id: nextId(),
			text: userBubbleText,
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
			await window.api.agent.send( promptForAgent, projectId, chat.id, {
				userMessageText: userBubbleText,
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
	const selectionLineCount = selection
		? selection.toLine - selection.fromLine + 1
		: 0;
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
			{ selection && (
				<div
					className="draft-chat-selection-chip"
					data-testid="draft-chat-selection"
					title={ selection.text }
				>
					<span
						className="draft-chat-selection-icon"
						aria-hidden="true"
					>
						{ '</>' }
					</span>
					<span className="draft-chat-selection-label">
						{ selectionLineCount === 1
							? `Line ${ selection.fromLine } selected`
							: `${ selectionLineCount } lines selected (${ selection.fromLine }–${ selection.toLine })` }
					</span>
					<button
						type="button"
						className="draft-chat-selection-clear"
						data-testid="draft-chat-selection-clear"
						aria-label="Remove selection"
						title="Remove selection"
						onClick={ onClearSelection }
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
				placeholder={
					selection
						? 'Ask about the selected lines…'
						: 'Ask for an edit on this draft…'
				}
				testIds={ {
					root: 'draft-chat-composer',
					input: 'draft-chat-input',
					send: 'draft-chat-send',
				} }
			/>
		</div>
	);
}
