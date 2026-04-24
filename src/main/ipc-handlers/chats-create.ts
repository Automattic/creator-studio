import type { IpcMainInvokeEvent } from 'electron';

import { createChat } from '../chatService';
import { ChatsCreateRequest } from '../ipc';

export function chatsCreate( _event: IpcMainInvokeEvent, payload: unknown ) {
	const { folderId, kind, title } = ChatsCreateRequest.parse( payload );
	return createChat( folderId, { kind, title } );
}
