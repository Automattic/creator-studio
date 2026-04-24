import type { IpcMainInvokeEvent } from 'electron';

import { getAgentService } from '../../services/agentRegistry';
import { PermissionResponse } from '..';

export function permissionRespond(
	event: IpcMainInvokeEvent,
	payload: unknown
): void {
	const response = PermissionResponse.parse( payload );
	const service = getAgentService( event.sender, response.folderId );
	if ( service ) {
		service.respondToPermission( response );
	}
}
