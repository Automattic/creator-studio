import type { IpcMainInvokeEvent } from 'electron';

import { listChats } from '../chatService';
import { ChatsListRequest } from '../ipc';

export function chatsList( _event: IpcMainInvokeEvent, payload: unknown ) {
	const { folderId } = ChatsListRequest.parse( payload );
	return listChats( folderId );
}
