import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getClaudeAuthStatus } from './utils/claude-auth-status';
import { IpcChannels } from '.';

export const authStatus = defineChannel( {
	name: IpcChannels.authStatus,
	input: z.void(),
	handle: () => getClaudeAuthStatus(),
} );
