import type { IpcMainInvokeEvent } from 'electron';

import { loadChat } from '../../services/chatService';
import { ChatsLoadRequest } from '..';

export function chatsLoad( _event: IpcMainInvokeEvent, payload: unknown ) {
	const { folderId, chatId } = ChatsLoadRequest.parse( payload );
	return loadChat( folderId, chatId );
}
