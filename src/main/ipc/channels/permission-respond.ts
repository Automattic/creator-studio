import { IpcChannels } from '..';
import { getAgentService } from '../../services/agentRegistry';
import { defineChannel } from './utils/define-channel';
import { PermissionResponse } from '../../../types';

export const permissionRespond = defineChannel( {
	name: IpcChannels.permissionRespond,
	input: PermissionResponse,
	handle: ( response, event ) => {
		const service = getAgentService( event.sender, response.folderId );
		if ( service ) {
			service.respondToPermission( response );
		}
	},
} );
