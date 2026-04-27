import { z } from 'zod';

import { IpcChannels } from '..';
import { getOrCreateAgentService } from '../../services/agentRegistry';
import { defineChannel } from './utils/define-channel';

export const chatSend = defineChannel( {
	name: IpcChannels.chatSend,
	input: z.object( {
		prompt: z.string().min( 1 ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ).optional(),
	} ),
	handle: ( { prompt, projectId, chatId }, event ) => {
		const service = getOrCreateAgentService( event.sender, projectId );
		// Fire-and-forget: returning the IPC handle immediately lets a
		// second invoke from a different project proceed in parallel. The
		// renderer clears its per-project busy state on the 'done' event,
		// not on this promise resolving.
		void service
			.send( prompt, chatId )
			.catch( ( err ) => service.emitError( err ) );
	},
} );
