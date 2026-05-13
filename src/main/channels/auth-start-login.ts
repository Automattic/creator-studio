import { spawn } from 'node:child_process';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { resolveClaudeCodeBinary } from './utils/resource-paths';
import { IpcChannels } from '.';

// Opens the user's terminal running `claude auth login` so the bundled binary
// owns the OAuth flow end-to-end (browser handoff, keychain write, refresh
// tokens). Studio Write never sees the OAuth credentials.
function spawnTerminalLogin( binary: string ): void {
	if ( process.platform === 'darwin' ) {
		// AppleScript can't escape an arbitrary string into `do script` safely;
		// path-quote the binary and rely on the shell to handle it.
		const cmd = `${ binary.replace( /"/g, '\\"' ) } auth login`;
		spawn(
			'osascript',
			[
				'-e',
				`tell application "Terminal" to do script "${ cmd }"`,
				'-e',
				'tell application "Terminal" to activate',
			],
			{ detached: true, stdio: 'ignore' }
		).unref();
		return;
	}
	if ( process.platform === 'win32' ) {
		spawn(
			'cmd',
			[ '/c', 'start', 'cmd', '/k', `"${ binary }" auth login` ],
			{
				detached: true,
				stdio: 'ignore',
				windowsHide: false,
			}
		).unref();
		return;
	}
	// Linux: best-effort. x-terminal-emulator is the Debian alias; bail
	// silently if it's not present and let the renderer fall back to a
	// copy-paste instruction.
	spawn( 'x-terminal-emulator', [ '-e', `${ binary } auth login` ], {
		detached: true,
		stdio: 'ignore',
	} ).unref();
}

export const authStartLogin = defineChannel( {
	name: IpcChannels.authStartLogin,
	input: z.void(),
	handle: () => {
		const binary = resolveClaudeCodeBinary();
		spawnTerminalLogin( binary );
		return { ok: true as const };
	},
} );
