import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getOrCreateAgentService } from './utils/agent-service';
import { IpcChannels } from '.';

export const agentSend = defineChannel( {
	name: IpcChannels.agentSend,
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
			.catch( ( err ) => service.emitError( err, chatId ) );
	},
} );
