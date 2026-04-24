import type { IpcMainInvokeEvent } from 'electron';

import { getOrCreateAgentService } from '../../agentRegistry';
import { SendRequest } from '..';

export function chatSend( event: IpcMainInvokeEvent, payload: unknown ): void {
	const { prompt, folderId, chatId } = SendRequest.parse( payload );
	const service = getOrCreateAgentService( event.sender, folderId );
	// Fire-and-forget: returning the IPC handle immediately lets a second
	// invoke from a different folder proceed in parallel. The renderer
	// clears its per-folder busy state on the 'done' event, not on this
	// promise resolving.
	void service
		.send( prompt, chatId )
		.catch( ( err ) => service.emitError( err ) );
}
