import React, { useState } from 'react';

import type { MessageSelection } from '../../types';
import { ChatComposer } from './ChatComposer';
import { ChatTranscript, type ChatMessage } from './ChatTranscript';
import { PermissionPrompt, type PermissionRequest } from './PermissionPrompt';
import { CloseIcon, SelectionsIcon } from '../icons';

export type AddedSelection = MessageSelection & {
	id: string;
};

type Props = {
	chatId: string | null;
	messages: ChatMessage[];
	busy: boolean;
	permissions: PermissionRequest[];
	addedSelections: AddedSelection[];
	onClearAddedSelections: () => void;
	onSend: (
		prompt: string,
		opts: {
			userMessageText?: string;
			selections?: MessageSelection[];
		}
	) => void;
	onCancel: () => void;
	onPermissionDecision: (
		requestId: string,
		decision: 'allow' | 'deny',
		remember: boolean
	) => void;
};

export function DraftChatPanel( {
	chatId,
	messages,
	busy,
	permissions,
	addedSelections,
	onClearAddedSelections,
	onSend,
	onCancel,
	onPermissionDecision,
}: Props ): React.ReactElement {
	const [ input, setInput ] = useState( '' );

	const handleSend = (): void => {
		const text = input.trim();
		if ( ! text || ! chatId || busy ) {
			return;
		}
		const sels = addedSelections;
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
						} from project resources:`,
						'',
						...sels.flatMap( ( s, i ) => [
							`[${ i + 1 }] ${ s.resourcePath }, lines ${
								s.fromLine
							}–${ s.toLine }:`,
							'```',
							s.text,
							'```',
							'',
						] ),
						'Their message:',
						text,
				  ].join( '\n' );
		const messageSelections: MessageSelection[] = sels.map( ( s ) => ( {
			resourcePath: s.resourcePath,
			text: s.text,
			fromLine: s.fromLine,
			toLine: s.toLine,
		} ) );
		setInput( '' );
		onSend( promptForAgent, {
			userMessageText: text,
			selections: messageSelections,
		} );
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
					onDecision={ onPermissionDecision }
				/>
			) }
			{ selectionsCount > 0 && (
				<div
					className="draft-chat-selection-chip"
					data-testid="draft-chat-selection"
					title={ addedSelections
						.map(
							( s ) =>
								`${ s.resourcePath }\nLines ${ s.fromLine }–${ s.toLine }:\n${ s.text }`
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
				onCancel={ ready ? onCancel : undefined }
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
