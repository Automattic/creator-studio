import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const DRAFTS_FOLDER = 'drafts';

export type DraftDeleteResult =
	| { ok: true }
	| { ok: false; reason: 'not-found' | 'io-error' };

export const draftsDelete = defineChannel( {
	name: IpcChannels.draftsDelete,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, relPath } ): DraftDeleteResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		// Mirror drafts-write: resolve, then re-anchor to <project>/drafts so a
		// relPath like '../escape.md' can't escape the drafts folder even
		// after path.join collapses it.
		const target = path.resolve(
			project.path,
			path.join( DRAFTS_FOLDER, relPath )
		);
		const draftsRoot = path.resolve( project.path, DRAFTS_FOLDER );
		if (
			target === draftsRoot ||
			( target !== draftsRoot &&
				! target.startsWith( draftsRoot + path.sep ) )
		) {
			return { ok: false, reason: 'not-found' };
		}
		try {
			const stat = fs.statSync( target );
			if ( ! stat.isFile() ) {
				return { ok: false, reason: 'not-found' };
			}
		} catch {
			return { ok: false, reason: 'not-found' };
		}
		try {
			fs.unlinkSync( target );
			return { ok: true };
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	},
} );
