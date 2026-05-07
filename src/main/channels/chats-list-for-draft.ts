import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { listDraftChats, resolveProjectPath } from './utils/chat-store';
import { IpcChannels } from '.';

export const chatsListForDraft = defineChannel( {
	name: IpcChannels.chatsListForDraft,
	input: z.object( {
		projectId: z.string().min( 1 ),
		draftRelPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, draftRelPath } ) => {
		const projectPath = resolveProjectPath( projectId );
		if ( ! projectPath ) {
			return [];
		}
		return listDraftChats( projectPath, draftRelPath );
	},
} );
