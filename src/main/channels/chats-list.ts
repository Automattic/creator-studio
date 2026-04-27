import { z } from 'zod';

import { listChats } from '../services/chats-list';
import { defineChannel } from './utils/define-channel';
import { IpcChannels } from './names';

export const chatsList = defineChannel( {
	name: IpcChannels.chatsList,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { projectId } ) => listChats( projectId ),
} );
