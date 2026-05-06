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

export type DraftReadResult = {
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

export const draftsRead = defineChannel( {
	name: IpcChannels.draftsRead,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		folder: z.enum( [ 'drafts', 'done' ] ).default( 'drafts' ),
	} ),
	handle: ( { projectId, relPath, folder } ): DraftReadResult => {
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
			return null;
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
				: relPath.replace( /\.md$/i, '' );
		return {
			title: fileTitle,
			body: parsed.content,
			frontmatter: data,
			mtime: stat.mtimeMs,
		};
	},
} );
