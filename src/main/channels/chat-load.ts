import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { loadChat } from '../services/chat-load';
import { defineChannel } from './utils/define-channel';

export const chatLoad = defineChannel( {
	name: IpcChannels.chatLoad,
	input: z.object( {
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
	} ),
	handle: ( { projectId, chatId } ) => loadChat( projectId, chatId ),
} );
