import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getAgentService } from './utils/agent-service';
import { IpcChannels } from '.';

export const agentCancel = defineChannel( {
	name: IpcChannels.agentCancel,
	input: z.object( {
		projectId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
	} ),
	handle: ( { projectId, chatId }, event ) => {
		const service = getAgentService( event.sender, projectId );
		service?.cancel( chatId );
	},
} );
