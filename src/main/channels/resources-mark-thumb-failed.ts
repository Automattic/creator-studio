import fs from 'node:fs';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { thumbHash, thumbPaths } from './utils/thumbnails';
import { IpcChannels } from '.';

export type ResourcesMarkThumbFailedResult =
	| { ok: true }
	| { ok: false; reason: 'not-found' | 'io-error' };

export const resourcesMarkThumbFailed = defineChannel( {
	name: IpcChannels.resourcesMarkThumbFailed,
	input: z.object( {
		projectId: z.string().min( 1 ),
		folder: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		mtime: z.number().nonnegative(),
	} ),
	handle: ( {
		projectId,
		folder,
		relPath,
		mtime,
	} ): ResourcesMarkThumbFailedResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const hash = thumbHash( `${ folder }/${ relPath }`, mtime );
		const t = thumbPaths( project.path, hash );
		try {
			fs.mkdirSync( t.dir, { recursive: true } );
			// Empty file — its existence is the signal. Reusing the file as a
			// log target later would mean rotating it, which we don't need.
			fs.writeFileSync( t.failedAbs, '' );
			return { ok: true };
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	},
} );
