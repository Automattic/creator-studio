import fs from 'node:fs';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { thumbHash, thumbPaths } from './utils/thumbnails';
import { IpcChannels } from '.';

// PNG of a card thumbnail — at ~320px wide they sit well under 200KB.
// Capping the base64 payload protects the IPC channel from a buggy renderer
// (or a hostile call) sending an oversized blob.
const MAX_BYTES = 1_000_000;
const MAX_B64_LENGTH = Math.ceil( ( MAX_BYTES * 4 ) / 3 ) + 16;

export type ResourcesSaveThumbResult =
	| { ok: true; thumbPath: string }
	| { ok: false; reason: 'not-found' | 'io-error' | 'too-large' };

export const resourcesSaveThumb = defineChannel( {
	name: IpcChannels.resourcesSaveThumb,
	input: z.object( {
		projectId: z.string().min( 1 ),
		folder: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		mtime: z.number().nonnegative(),
		dataB64: z.string().max( MAX_B64_LENGTH ),
	} ),
	handle: ( {
		projectId,
		folder,
		relPath,
		mtime,
		dataB64,
	} ): ResourcesSaveThumbResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		let buf: Buffer;
		try {
			buf = Buffer.from( dataB64, 'base64' );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		if ( buf.length === 0 || buf.length > MAX_BYTES ) {
			return { ok: false, reason: 'too-large' };
		}
		const hash = thumbHash( `${ folder }/${ relPath }`, mtime );
		const t = thumbPaths( project.path, hash );
		try {
			fs.mkdirSync( t.dir, { recursive: true } );
			fs.writeFileSync( t.pngAbs, buf );
			// A previous failure marker for the same key shouldn't outlive a
			// successful write — otherwise the next list call would still
			// see "failed" even though the png is now on disk.
			try {
				fs.unlinkSync( t.failedAbs );
			} catch {
				/* expected when no marker exists */
			}
			return { ok: true, thumbPath: t.pngRel };
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	},
} );
