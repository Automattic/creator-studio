import { shell } from 'electron';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { IpcChannels } from '.';

// Restrict to http(s) only. Forbid file://, javascript:, data:, custom
// schemes — anything that could exfiltrate or execute. The shell.openExternal
// docs note that the OS will obey arbitrary schemes (e.g. mailto:, slack:),
// which we don't want from a renderer-driven channel.
function isSafeUrl( raw: string ): boolean {
	let url: URL;
	try {
		url = new URL( raw );
	} catch {
		return false;
	}
	return url.protocol === 'http:' || url.protocol === 'https:';
}

export type ShellOpenExternalResult =
	| { ok: true }
	| { ok: false; reason: 'invalid-url' | 'open-failed' };

export const shellOpenExternal = defineChannel( {
	name: IpcChannels.shellOpenExternal,
	input: z.object( {
		url: z.string().min( 1 ),
	} ),
	handle: async ( { url } ): Promise< ShellOpenExternalResult > => {
		if ( ! isSafeUrl( url ) ) {
			return { ok: false, reason: 'invalid-url' };
		}
		try {
			await shell.openExternal( url );
			return { ok: true };
		} catch {
			return { ok: false, reason: 'open-failed' };
		}
	},
} );
