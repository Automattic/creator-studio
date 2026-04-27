import React from 'react';

import type { ChatMeta } from '../../../types';

import { PermissionPrompt, type PermissionRequest } from '../PermissionPrompt';
import { ToolBlock } from '../ToolBlock';

export type UserMessage = {
	kind: 'user';
	id: string;
	text: string;
};

export type AssistantMessage = {
	kind: 'assistant';
	id: string;
	text: string;
	streaming: boolean;
	errored?: boolean;
};

export type ToolMessage = {
	kind: 'tool';
	id: string;
	toolUseId: string;
	toolName: string;
	input: unknown;
	status: 'running' | 'done' | 'error';
	output?: string;
};

export type Message = UserMessage | AssistantMessage | ToolMessage;

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

type Props = {
	activeFolderId: string | null;
	activeChatId: string | null;
	chats: ChatMeta[];
	messages: Message[];
	permissions: PermissionRequest[];
	input: string;
	busy: boolean;
	onInputChange: ( value: string ) => void;
	onSelectChat: ( chatId: string ) => void;
	onNewChat: () => void;
	onStartStarterChat: ( kind: 'ideas' | 'draft' ) => void;
	onSend: () => void;
	onPermissionDecision: (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	) => void;
};

export function ProjectScreen( {
	activeFolderId,
	activeChatId,
	chats,
	messages,
	permissions,
	input,
	busy,
	onInputChange,
	onSelectChat,
	onNewChat,
	onStartStarterChat,
	onSend,
	onPermissionDecision,
}: Props ): React.ReactElement {
	const chatLabels = computeChatLabels( chats );
	const actionsDisabled = ! activeFolderId || busy;
	const inputDisabled =
		busy || permissions.length > 0 || ! activeFolderId || ! activeChatId;
	const composerDisabled = inputDisabled || input.trim().length === 0;

	return (
		<section data-testid="screen-project" aria-label="Project">
			<div
				className="transcript-actions"
				data-testid="transcript-actions"
			>
				<div
					className="transcript-actions-chats"
					data-testid="chat-selector"
				>
					{ chats.length === 0 && (
						<span className="transcript-actions-chat-placeholder">
							No chats
						</span>
					) }
					{ chats.map( ( chat ) => (
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
						onClick={ onNewChat }
						disabled={ actionsDisabled }
					>
						+ New chat
					</button>
					<button
						type="button"
						className="transcript-action-btn"
						data-testid="chat-ideas"
						onClick={ () => onStartStarterChat( 'ideas' ) }
						disabled={ actionsDisabled }
					>
						Generate ideas
					</button>
					<button
						type="button"
						className="transcript-action-btn"
						data-testid="chat-draft"
						onClick={ () => onStartStarterChat( 'draft' ) }
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
								<div className="bubble-text">{ m.text }</div>
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
								<div className="bubble-text">{ m.text }</div>
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
					onDecision={ onPermissionDecision }
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
					onChange={ ( e ) => onInputChange( e.target.value ) }
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
		</section>
	);
}
