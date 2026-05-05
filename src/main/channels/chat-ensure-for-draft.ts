import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { ensureDraftChat, resolveProjectPath } from './utils/chat-store';
import { IpcChannels } from '.';

// Returns (creating if absent) the draft-editor chat for the given draft.
// One chat per draft is what the UI shows today; the underlying store can
// hold many chats per draft, so future multi-chat-per-draft UI doesn't need
// a migration.
export const chatEnsureForDraft = defineChannel( {
	name: IpcChannels.chatEnsureForDraft,
	input: z.object( {
		projectId: z.string().min( 1 ),
		draftRelPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, draftRelPath } ) => {
		const projectPath = resolveProjectPath( projectId );
		if ( ! projectPath ) {
			throw new Error( `Unknown project: ${ projectId }` );
		}
		return ensureDraftChat( projectPath, draftRelPath );
	},
} );
