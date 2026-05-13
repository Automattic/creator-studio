import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

import type { ClaudeAuthStatus } from '../../types';
import { defineChannel } from './utils/define-channel';
import { refreshClaudeAuthStatus } from './utils/claude-auth-status';
import { resolveClaudeCodeBinary } from './utils/resource-paths';
import { IpcChannels } from '.';

const execFileAsync = promisify( execFile );

export const authLogout = defineChannel( {
	name: IpcChannels.authLogout,
	input: z.void(),
	handle: async (): Promise< ClaudeAuthStatus > => {
		try {
			await execFileAsync(
				resolveClaudeCodeBinary(),
				[ 'auth', 'logout' ],
				{ timeout: 5000 }
			);
		} catch {
			// Already logged out, or the binary errored — fall through to a
			// refresh so the renderer sees the real state either way.
		}
		return refreshClaudeAuthStatus();
	},
} );
