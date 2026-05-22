import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const CHECKS_FOLDER = 'checks';
const MAX_BYTES = 5_000_000;

export type CheckReadResult = {
	title: string;
	enabled: boolean;
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

export const checksRead = defineChannel( {
	name: IpcChannels.checksRead,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, relPath } ): CheckReadResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return null;
		}
		const target = resolveInside(
			project.path,
			path.join( CHECKS_FOLDER, relPath )
		);
		if ( ! target ) {
			return null;
		}
		const folderRoot = path.resolve( project.path, CHECKS_FOLDER );
		if (
			target !== folderRoot &&
			! target.startsWith( folderRoot + path.sep )
		) {
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
		let data: Record< string, unknown > = {};
		let body = raw;
		try {
			const parsed = matter( raw );
			data = parsed.data as Record< string, unknown >;
			body = parsed.content;
		} catch {
			// YAML parse failure — return the raw body with empty frontmatter
			// so the inline editor can open it and the user can repair the
			// syntax. Other callers should rely on `checks:list`'s parseError.
		}
		const titleValue = data.title;
		const title =
			typeof titleValue === 'string' && titleValue.trim().length > 0
				? titleValue
				: path.basename( relPath, '.md' );
		const enabled = data.enabled === true;
		return {
			title,
			enabled,
			body,
			frontmatter: data,
			mtime: stat.mtimeMs,
		};
	},
} );
