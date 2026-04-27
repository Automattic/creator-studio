import { z } from 'zod';

import { listRecentChats } from '../services/chats-recent';
import { defineChannel } from './utils/define-channel';
import { IpcChannels } from './names';

export const chatsRecent = defineChannel( {
	name: IpcChannels.chatsRecent,
	input: z.void(),
	handle: () => listRecentChats(),
} );
