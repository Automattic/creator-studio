import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { resolveProjectPath, touchMeta } from './utils/chat-store';
import { IpcChannels } from '.';

export const chatRename = defineChannel( {
	name: IpcChannels.chatRename,
	input: z.object( {
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
		title: z.string(),
	} ),
	handle: ( { projectId, chatId, title } ) => {
		const projectPath = resolveProjectPath( projectId );
		if ( ! projectPath ) {
			return null;
		}
		return touchMeta( projectPath, chatId, { title: title.trim() } );
	},
} );
