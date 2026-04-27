import { defineChannel } from './utils/define-channel';
import { getAgentService } from './utils/agent-service';
import { IpcChannels } from '.';
import { PermissionResponse } from '../../types';

export const agentRespondPermission = defineChannel( {
	name: IpcChannels.agentRespondPermission,
	input: PermissionResponse,
	handle: ( response, event ) => {
		const service = getAgentService( event.sender, response.projectId );
		if ( service ) {
			service.respondToPermission( response );
		}
	},
} );
