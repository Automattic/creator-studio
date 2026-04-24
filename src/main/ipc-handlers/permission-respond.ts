import type { IpcMainInvokeEvent } from 'electron';

import { getAgentService } from '../agentRegistry';
import { PermissionResponse } from '../ipc';

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
