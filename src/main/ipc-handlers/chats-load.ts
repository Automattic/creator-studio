import type { IpcMainInvokeEvent } from 'electron';

import { loadChat } from '../chatService';
import { ChatsLoadRequest } from '../ipc';

export function chatsLoad( _event: IpcMainInvokeEvent, payload: unknown ) {
	const { folderId, chatId } = ChatsLoadRequest.parse( payload );
	return loadChat( folderId, chatId );
}
