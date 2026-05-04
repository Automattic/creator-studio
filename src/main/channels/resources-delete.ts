import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const RESOURCE_FOLDERS = [ 'sources', 'drafts', 'published' ] as const;
export type ResourceFolder = ( typeof RESOURCE_FOLDERS )[ number ];

export type ResourceDeleteResult =
	| { ok: true }
	| { ok: false; reason: 'not-found' | 'io-error' };

export const resourcesDelete = defineChannel( {
	name: IpcChannels.resourcesDelete,
	input: z.object( {
		projectId: z.string().min( 1 ),
		folder: z.enum( RESOURCE_FOLDERS ),
		relPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, folder, relPath } ): ResourceDeleteResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		// Resolve, then re-anchor to <project>/<folder> so a relPath like
		// '../escape.md' can't escape the resource folder even after
		// path.join collapses it.
		const target = path.resolve(
			project.path,
			path.join( folder, relPath )
		);
		const folderRoot = path.resolve( project.path, folder );
		if (
			target === folderRoot ||
			( target !== folderRoot &&
				! target.startsWith( folderRoot + path.sep ) )
		) {
			return { ok: false, reason: 'not-found' };
		}
		let isDirectory: boolean;
		try {
			const stat = fs.statSync( target );
			if ( ! stat.isFile() && ! stat.isDirectory() ) {
				return { ok: false, reason: 'not-found' };
			}
			isDirectory = stat.isDirectory();
		} catch {
			return { ok: false, reason: 'not-found' };
		}
		try {
			if ( isDirectory ) {
				fs.rmSync( target, { recursive: true, force: true } );
			} else {
				fs.unlinkSync( target );
			}
			return { ok: true };
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	},
} );
