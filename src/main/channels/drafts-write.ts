import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const DRAFTS_FOLDER = 'drafts';
const MAX_BYTES = 25_000_000;

export type DraftWriteResult =
	| { ok: true; mtime: number }
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

// `gray-matter`'s data slot is loosely typed (the parsed YAML can hold
// anything). We normalize to a plain record + the user's edited `title`
// so non-title keys round-trip while title becomes the canonical entry.
function assemble(
	body: string,
	frontmatter: Record< string, unknown >,
	title: string
): string {
	const data = { ...frontmatter, title };
	return matter.stringify( body, data );
}

export const draftsWrite = defineChannel( {
	name: IpcChannels.draftsWrite,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		title: z.string(),
		body: z.string().max( MAX_BYTES ),
		frontmatter: z.record( z.string(), z.unknown() ),
		expectedMtime: z.number().nullable(),
	} ),
	handle: ( {
		projectId,
		relPath,
		title,
		body,
		frontmatter,
		expectedMtime,
	} ): DraftWriteResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const target = resolveInside(
			project.path,
			path.join( DRAFTS_FOLDER, relPath )
		);
		if ( ! target ) {
			return { ok: false, reason: 'not-found' };
		}
		// mtime conflict guard. expectedMtime null = first-write-wins (file may
		// not yet exist). Otherwise refuse if the on-disk mtime drifted under us.
		if ( expectedMtime !== null ) {
			try {
				const stat = fs.statSync( target );
				if ( Math.abs( stat.mtimeMs - expectedMtime ) > 1 ) {
					return { ok: false, reason: 'mtime-conflict' };
				}
			} catch {
				// File missing while caller thought it existed: treat as conflict.
				return { ok: false, reason: 'mtime-conflict' };
			}
		}
		const assembled = assemble( body, frontmatter, title );
		try {
			fs.mkdirSync( path.dirname( target ), { recursive: true } );
			fs.writeFileSync( target, assembled, 'utf-8' );
			const stat = fs.statSync( target );
			return { ok: true, mtime: stat.mtimeMs };
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	},
} );
