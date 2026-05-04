import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getOrCreateAgentService } from './utils/agent-service';
import { IpcChannels } from '.';
import { DraftAttachment } from '../../types';

export const agentSend = defineChannel( {
	name: IpcChannels.agentSend,
	input: z.object( {
		prompt: z.string().min( 1 ),
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ).optional(),
		// When set, persist this as the user-visible bubble text instead of
		// `prompt`. Lets contextual flows (e.g. "Chat" on a draft card) send
		// a path-laden prompt to the agent while showing a clean message.
		userMessageText: z.string().min( 1 ).optional(),
		attachments: z.array( DraftAttachment ).optional(),
	} ),
	handle: (
		{ prompt, projectId, chatId, userMessageText, attachments },
		event
	) => {
		const service = getOrCreateAgentService( event.sender, projectId );
		// Fire-and-forget: returning the IPC handle immediately lets a
		// second invoke from a different project proceed in parallel. The
		// renderer clears its per-project busy state on the 'done' event,
		// not on this promise resolving.
		void service
			.send( prompt, chatId, { userMessageText, attachments } )
			.catch( ( err ) => service.emitError( err, chatId ) );
	},
} );
