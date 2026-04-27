import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { listChats } from '../services/chat';
import { defineChannel } from './utils/define-channel';

export const chatsList = defineChannel( {
	name: IpcChannels.chatsList,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: ( { projectId } ) => listChats( projectId ),
} );
