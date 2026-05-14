import path from 'node:path';

import { z } from 'zod';

import { notesOnFileChanged } from './notes-on-file-changed';
import { defineChannel } from './utils/define-channel';
import { subscribe } from './utils/note-watcher';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

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

export type NotesWatchResult =
	| { ok: true }
	| { ok: false; reason: 'not-found' };

export const notesWatch = defineChannel( {
	name: IpcChannels.notesWatch,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		folder: z.string().min( 1 ).default( 'drafts' ),
	} ),
	handle: ( { projectId, relPath, folder }, event ): NotesWatchResult => {
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
		// Same containment rail as notes-write so a relPath like
		// '../escape.md' can't slip past the outer guard.
		const folderRoot = path.resolve( project.path, folder );
		if (
			target !== folderRoot &&
			! target.startsWith( folderRoot + path.sep )
		) {
			return { ok: false, reason: 'not-found' };
		}
		const sender = event.sender;
		subscribe( sender, target, ( mtime ) => {
			notesOnFileChanged.emit( sender, {
				projectId,
				relPath,
				mtime,
			} );
		} );
		return { ok: true };
	},
} );
