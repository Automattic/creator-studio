import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { refreshClaudeAuthStatus } from './utils/claude-auth-status';
import { IpcChannels } from '.';

export const authStatusRefresh = defineChannel( {
	name: IpcChannels.authStatusRefresh,
	input: z.void(),
	handle: () => refreshClaudeAuthStatus(),
} );
