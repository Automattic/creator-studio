import type { IpcMainInvokeEvent } from 'electron';

import { listChats } from '../../services/chatService';
import { ChatsListRequest } from '..';

export function chatsList( _event: IpcMainInvokeEvent, payload: unknown ) {
	const { folderId } = ChatsListRequest.parse( payload );
	return listChats( folderId );
}
