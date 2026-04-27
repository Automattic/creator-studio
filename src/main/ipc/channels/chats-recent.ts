import { z } from 'zod';

import { IpcChannels } from '..';
import { listRecentChats } from '../../services/chat';
import { defineChannel } from './utils/define-channel';

export const chatsRecent = defineChannel( {
	name: IpcChannels.chatsRecent,
	input: z.void(),
	handle: () => listRecentChats(),
} );
