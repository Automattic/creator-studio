import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { removeChat, resolveProjectPath } from './utils/chat-store';
import { IpcChannels } from '.';

export const chatRemove = defineChannel( {
	name: IpcChannels.chatRemove,
	input: z.object( {
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
	} ),
	handle: ( { projectId, chatId } ) => {
		const projectPath = resolveProjectPath( projectId );
		if ( ! projectPath ) {
			return false;
		}
		return removeChat( projectPath, chatId );
	},
} );
