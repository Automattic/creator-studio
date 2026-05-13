import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const DEFAULT_TITLE = 'Untitled';
const BASENAME = 'untitled';
// `done` is intentionally excluded — done files are the result of marking a
// draft done, not a fresh-file destination. Notes only get created under
// drafts/ or sources/ (including nested subfolders below them).
const ALLOWED_ROOTS = [ 'drafts', 'sources' ] as const;

export type NoteCreateResult =
	| { ok: true; relPath: string; title: string }
	| { ok: false; reason: 'not-found' | 'io-error' | 'invalid-path' };

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

function topSegment( relPath: string ): string {
	const norm = relPath.replace( /\\/g, '/' ).replace( /^\/+/, '' );
	const slash = norm.indexOf( '/' );
	return slash === -1 ? norm : norm.slice( 0, slash );
}

// Walk `untitled.md`, `untitled-2.md`, … until we find a name that doesn't
// exist on disk. We stop at 1000 to avoid an unbounded loop if something
// pathological is happening; in practice the user will run out of patience
// long before we run out of slots.
function pickAvailableName( dir: string ): string | null {
	for ( let i = 1; i <= 1000; i++ ) {
		const name = i === 1 ? `${ BASENAME }.md` : `${ BASENAME }-${ i }.md`;
		if ( ! fs.existsSync( path.join( dir, name ) ) ) {
			return name;
		}
	}
	return null;
}

export const notesCreate = defineChannel( {
	name: IpcChannels.notesCreate,
	input: z.object( {
		projectId: z.string().min( 1 ),
		// Destination directory relative to the project root. May be a
		// top-level group (`drafts` / `sources` / `done`) or a nested
		// subfolder beneath one (`sources/notes`). Validated below so the
		// renderer can't write anywhere else in the project.
		folder: z.string().min( 1 ).default( 'drafts' ),
	} ),
	handle: ( { projectId, folder } ): NoteCreateResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const top = topSegment( folder );
		if (
			! ALLOWED_ROOTS.includes(
				top as ( typeof ALLOWED_ROOTS )[ number ]
			)
		) {
			return { ok: false, reason: 'invalid-path' };
		}
		const dir = resolveInside( project.path, folder );
		if ( ! dir ) {
			return { ok: false, reason: 'invalid-path' };
		}
		try {
			fs.mkdirSync( dir, { recursive: true } );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		const name = pickAvailableName( dir );
		if ( ! name ) {
			return { ok: false, reason: 'io-error' };
		}
		const target = path.join( dir, name );
		const contents = matter.stringify( '', { title: DEFAULT_TITLE } );
		try {
			fs.writeFileSync( target, contents, {
				encoding: 'utf-8',
				flag: 'wx',
			} );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		// `relPath` is relative to the top-level group so renderer surfaces
		// keyed on `{ folder: group, relPath }` resolve correctly for both
		// nested and root-level notes.
		const groupRoot = path.resolve( project.path, top );
		const relPath = path.relative( groupRoot, target );
		return { ok: true, relPath, title: DEFAULT_TITLE };
	},
} );
