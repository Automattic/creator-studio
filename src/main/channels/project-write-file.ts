import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

// 25 MB. The inline editor (renderer) round-trips full file contents for
// every save, so we mirror the cap on `notes:write` rather than the
// preview-sized cap on `project:readFile`.
const MAX_BYTES = 25_000_000;

export type ProjectWriteFileResult =
	| { ok: true; mtime: number }
	| { ok: false; reason: 'not-found' | 'mtime-conflict' | 'io-error' };

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

export const projectWriteFile = defineChannel( {
	name: IpcChannels.projectWriteFile,
	input: z.object( {
		projectId: z.string().min( 1 ),
		folder: z.enum( [ 'sources', 'drafts', 'done' ] ),
		relPath: z.string().min( 1 ),
		contents: z.string().max( MAX_BYTES ),
		expectedMtime: z.number().nullable(),
	} ),
	handle: ( {
		projectId,
		folder,
		relPath,
		contents,
		expectedMtime,
	} ): ProjectWriteFileResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const target = resolveInside(
			project.path,
			path.join( folder, relPath )
		);
		if ( ! target ) {
			return { ok: false, reason: 'not-found' };
		}
		// Stricter rail: even if the resolved path lands inside the project
		// root, refuse anything that isn't inside <project>/<folder>/. Without
		// this, a relPath like '../escape.txt' would slide through the outer
		// guard because path.join collapses it to 'escape.txt'.
		const folderRoot = path.resolve( project.path, folder );
		if (
			target !== folderRoot &&
			! target.startsWith( folderRoot + path.sep )
		) {
			return { ok: false, reason: 'not-found' };
		}
		if ( expectedMtime !== null ) {
			try {
				const stat = fs.statSync( target );
				if ( Math.abs( stat.mtimeMs - expectedMtime ) > 1 ) {
					return { ok: false, reason: 'mtime-conflict' };
				}
			} catch {
				return { ok: false, reason: 'mtime-conflict' };
			}
		}
		try {
			fs.mkdirSync( path.dirname( target ), { recursive: true } );
			fs.writeFileSync( target, contents, 'utf-8' );
			const stat = fs.statSync( target );
			return { ok: true, mtime: stat.mtimeMs };
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	},
} );
