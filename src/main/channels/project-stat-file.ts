import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

// In-bounds resolution mirrors project-read-file.ts.
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

export type StatFileResult = { mtime: number } | null;

export const projectStatFile = defineChannel( {
	name: IpcChannels.projectStatFile,
	input: z.object( {
		projectId: z.string().min( 1 ),
		subPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, subPath } ): StatFileResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return null;
		}
		const target = resolveInside( project.path, subPath );
		if ( ! target ) {
			return null;
		}
		try {
			const stat = fs.statSync( target );
			if ( ! stat.isFile() ) {
				return null;
			}
			return { mtime: stat.mtimeMs };
		} catch {
			return null;
		}
	},
} );
