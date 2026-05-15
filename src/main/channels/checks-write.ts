import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const CHECKS_FOLDER = 'checks';
const MAX_BYTES = 5_000_000;

export type CheckWriteResult =
	| { ok: true; mtime: number; relPath: string }
	| {
			ok: false;
			reason: 'not-found' | 'mtime-conflict' | 'io-error';
	  };

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

// Hoist title + enabled into the frontmatter as canonical keys so the wire
// callers don't have to remember to do it. Other frontmatter keys are
// preserved untouched.
function assemble(
	body: string,
	frontmatter: Record< string, unknown >,
	title: string,
	enabled: boolean
): string {
	const data = { ...frontmatter, title, enabled };
	return matter.stringify( body, data );
}

export const checksWrite = defineChannel( {
	name: IpcChannels.checksWrite,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		title: z.string(),
		enabled: z.boolean(),
		body: z.string().max( MAX_BYTES ),
		frontmatter: z.record( z.string(), z.unknown() ),
		expectedMtime: z.number().nullable(),
	} ),
	handle: ( {
		projectId,
		relPath,
		title,
		enabled,
		body,
		frontmatter,
		expectedMtime,
	} ): CheckWriteResult => {
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
		const assembled = assemble( body, frontmatter, title, enabled );
		try {
			fs.mkdirSync( path.dirname( target ), { recursive: true } );
			fs.writeFileSync( target, assembled, 'utf-8' );
			const stat = fs.statSync( target );
			return { ok: true, mtime: stat.mtimeMs, relPath };
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	},
} );
