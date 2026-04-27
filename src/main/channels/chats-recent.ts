import { z } from 'zod';

import { IpcChannels } from '../ipc';
import { listRecentChats } from '../services/chats-recent';
import { defineChannel } from './utils/define-channel';

export const chatsRecent = defineChannel( {
	name: IpcChannels.chatsRecent,
	input: z.void(),
	handle: () => listRecentChats(),
} );
