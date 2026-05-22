import { spawn } from 'node:child_process';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { resolveClaudeCodeBinary } from './utils/resource-paths';
import { IpcChannels } from '.';

// Wrap a value in single quotes for a POSIX shell. Single quotes are fully
// literal in sh/zsh; the only character needing care is the single quote
// itself (close quote, emit an escaped quote, reopen).
export function shellSingleQuote( value: string ): string {
	return `'${ value.replace( /'/g, `'\\''` ) }'`;
}

// Escape a value for an AppleScript double-quoted string literal: backslash
// first, then the double quote.
export function appleScriptStringLiteral( value: string ): string {
	return value.replace( /\\/g, '\\\\' ).replace( /"/g, '\\"' );
}

// Opens the user's terminal running `claude auth login` so the bundled binary
// owns the OAuth flow end-to-end (browser handoff, keychain write, refresh
// tokens). Studio Write never sees the OAuth credentials.
function spawnTerminalLogin( binary: string ): void {
	// Shell-quoted so a space in the .app bundle name ("Studio Write.app")
	// doesn't split the command inside the user's terminal.
	const command = `${ shellSingleQuote( binary ) } auth login`;
	if ( process.platform === 'darwin' ) {
		spawn(
			'osascript',
			[
				'-e',
				`tell application "Terminal" to do script "${ appleScriptStringLiteral(
					command
				) }"`,
				'-e',
				'tell application "Terminal" to activate',
			],
			{ detached: true, stdio: 'ignore' }
		).unref();
		return;
	}
	if ( process.platform === 'win32' ) {
		// cmd.exe quoting differs from POSIX; double-quote the path here.
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
	spawn( 'x-terminal-emulator', [ '-e', command ], {
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
