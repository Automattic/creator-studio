import { z } from 'zod';

import { IpcChannels } from '..';
import { getOrCreateAgentService } from '../../services/agentRegistry';
import { defineChannel } from '../define-channel';

export const chatSend = defineChannel( {
	name: IpcChannels.chatSend,
	input: z.object( {
		prompt: z.string().min( 1 ),
		folderId: z.string().min( 1 ),
		chatId: z.string().min( 1 ).optional(),
	} ),
	handle: ( { prompt, folderId, chatId }, event ) => {
		const service = getOrCreateAgentService( event.sender, folderId );
		// Fire-and-forget: returning the IPC handle immediately lets a
		// second invoke from a different folder proceed in parallel. The
		// renderer clears its per-folder busy state on the 'done' event,
		// not on this promise resolving.
		void service
			.send( prompt, chatId )
			.catch( ( err ) => service.emitError( err ) );
	},
} );
