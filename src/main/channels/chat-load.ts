import { z } from 'zod';

import { loadChat } from '../services/chat-load';
import { defineChannel } from './utils/define-channel';
import { IpcChannels } from './names';

export const chatLoad = defineChannel( {
	name: IpcChannels.chatLoad,
	input: z.object( {
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
	} ),
	handle: ( { projectId, chatId } ) => loadChat( projectId, chatId ),
} );
