import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';
import type { DirEntry } from '../../types';

// Resolve `subPath` relative to the project root and refuse anything that
// escapes it via `..` or symlinks. Returning `null` for out-of-bounds keeps
// the renderer from probing the wider filesystem through this channel.
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

export const projectListFiles = defineChannel( {
	name: IpcChannels.projectListFiles,
	input: z.object( {
		projectId: z.string().min( 1 ),
		subPath: z.string().default( '' ),
	} ),
	handle: ( { projectId, subPath } ): DirEntry[] => {
		const project = getProject( projectId );
		if ( ! project ) {
			return [];
		}
		const target = resolveInside( project.path, subPath );
		if ( ! target ) {
			return [];
		}
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync( target, { withFileTypes: true } );
		} catch {
			return [];
		}
		const mapped: DirEntry[] = entries.map( ( e ) => ( {
			name: e.name,
			isDirectory: e.isDirectory(),
		} ) );
		mapped.sort( ( a, b ) => {
			if ( a.isDirectory !== b.isDirectory ) {
				return a.isDirectory ? -1 : 1;
			}
			return a.name.localeCompare( b.name );
		} );
		return mapped;
	},
} );
