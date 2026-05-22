import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

// 25 MB. Drafts are long-form prose, sometimes with inline base64 images;
// the 1 MB cap on `project:readFile` was sized for previews, not editing.
const MAX_BYTES = 25_000_000;

export type NoteReadResult = {
	title: string;
	body: string;
	frontmatter: Record< string, unknown >;
	mtime: number;
} | null;

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

export const notesRead = defineChannel( {
	name: IpcChannels.notesRead,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		folder: z
			.enum( [ 'drafts', 'done', 'sources', 'checks' ] )
			.default( 'drafts' ),
	} ),
	handle: ( { projectId, relPath, folder } ): NoteReadResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return null;
		}
		const target = resolveInside(
			project.path,
			path.join( folder, relPath )
		);
		if ( ! target ) {
			return null;
		}
		let stat: fs.Stats;
		try {
			stat = fs.statSync( target );
		} catch {
			// Checks have their own create flow and a managed list — if the
			// file is gone (e.g. just deleted via "Reset to defaults"), don't
			// resurrect it under a slug-derived title. The editor will show
			// the not-found state and the user navigates away.
			if ( folder === 'checks' ) {
				return null;
			}
			// File was deleted — create an empty one so the editor can
			// open it instead of showing a dead-end error.
			const title = path.basename( relPath, '.md' );
			const contents = matter.stringify( '', { title } );
			try {
				fs.mkdirSync( path.dirname( target ), {
					recursive: true,
				} );
				fs.writeFileSync( target, contents, {
					encoding: 'utf-8',
					flag: 'wx',
				} );
				stat = fs.statSync( target );
			} catch {
				return null;
			}
		}
		if ( ! stat.isFile() || stat.size > MAX_BYTES ) {
			return null;
		}
		let raw: string;
		try {
			raw = fs.readFileSync( target, 'utf-8' );
		} catch {
			return null;
		}
		const parsed = matter( raw );
		const data = parsed.data as Record< string, unknown >;
		const titleValue = data.title;
		const fileTitle =
			typeof titleValue === 'string' && titleValue.trim().length > 0
				? titleValue
				: path.basename( relPath, '.md' );
		return {
			title: fileTitle,
			body: parsed.content,
			frontmatter: data,
			mtime: stat.mtimeMs,
		};
	},
} );
