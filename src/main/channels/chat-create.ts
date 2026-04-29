import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { resolveProjectPath, touchMeta } from './utils/chat-store';
import { IpcChannels } from '.';

export const chatCreate = defineChannel( {
	name: IpcChannels.chatCreate,
	input: z.object( {
		projectId: z.string().min( 1 ),
		title: z.string().optional(),
		draftPath: z.string().optional(),
	} ),
	handle: ( { projectId, title, draftPath } ) => {
		const projectPath = resolveProjectPath( projectId );
		if ( ! projectPath ) {
			return null;
		}
		return touchMeta( projectPath, randomUUID(), { title, draftPath } );
	},
} );
