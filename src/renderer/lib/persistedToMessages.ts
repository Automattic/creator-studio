import type { PersistedMessage } from '../../types';
import type { Message } from '../screens/ProjectScreen';

// Maps on-disk PersistedMessage records to the renderer's Message shape.
// Shared by chat-transcript hydration and the task-run detail view.
export function persistedToMessages(
	persisted: PersistedMessage[]
): Message[] {
	return persisted.map( ( p ): Message => {
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
