import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const CHECKS_FOLDER = 'checks';

export type CheckDeleteResult =
	| { ok: true }
	| { ok: false; reason: 'not-found' | 'io-error' };

function resolveInside( root: string, subPath: string ): string | null {
	const target = path.resolve( root, subPath );
	const rootResolved = path.resolve( root );
	if (
		target !== rootResolved &&
		! target.startsWith( rootResolved + path.sep )
	) {
		return null;
	}
	return target;
}

export const checksDelete = defineChannel( {
	name: IpcChannels.checksDelete,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, relPath } ): CheckDeleteResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const target = resolveInside(
			project.path,
			path.join( CHECKS_FOLDER, relPath )
		);
		if ( ! target ) {
			return { ok: false, reason: 'not-found' };
		}
		const folderRoot = path.resolve( project.path, CHECKS_FOLDER );
		if ( ! target.startsWith( folderRoot + path.sep ) ) {
			return { ok: false, reason: 'not-found' };
		}
		try {
			fs.unlinkSync( target );
			return { ok: true };
		} catch ( err ) {
			if (
				err &&
				typeof err === 'object' &&
				'code' in err &&
				err.code === 'ENOENT'
			) {
				return { ok: false, reason: 'not-found' };
			}
			return { ok: false, reason: 'io-error' };
		}
	},
} );
