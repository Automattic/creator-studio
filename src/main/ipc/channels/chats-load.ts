import { z } from 'zod';

import { IpcChannels } from '..';
import { loadChat } from '../../services/chat';
import { defineChannel } from '../define-channel';

export const chatsLoad = defineChannel( {
	name: IpcChannels.chatsLoad,
	input: z.object( {
		folderId: z.string().min( 1 ),
		chatId: z.string().min( 1 ),
	} ),
	handle: ( { folderId, chatId } ) => loadChat( folderId, chatId ),
} );
