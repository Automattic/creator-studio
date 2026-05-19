import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { remapDraftRelPath } from './utils/chat-store';
import { getProject } from './utils/project-get';
import { resolveInside, splitName } from './utils/sources-paths';
import { slugifyTitle } from './utils/slugify';
import { IpcChannels } from '.';

const RESOURCE_FOLDERS = [ 'sources', 'drafts', 'done', 'checks' ] as const;

export type ResourceRenameResult =
	| { ok: true; relPath: string; name: string }
	| {
			ok: false;
			reason: 'not-found' | 'invalid-name' | 'collision' | 'io-error';
	  };

function caseInsensitiveEq( a: string, b: string ): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

// Sanitize a desired name into a valid filename stem. For markdown files
// this matches the existing slugifyTitle behaviour so rename produces the
// same on-disk shape regardless of entry point. For everything else we
// keep a wider character set (spaces, uppercase, unicode) and only strip
// characters that are unsafe for filesystems.
function sanitizeStem( desired: string, isMarkdown: boolean ): string | null {
	if ( isMarkdown ) {
		return slugifyTitle( desired );
	}
	const stripped = desired
		.replace( /[/\\:*?"<>|]/g, '' )
		.replace( /\s+/g, ' ' )
		.trim();
	return stripped.length > 0 ? stripped : null;
}

// Pick a collision-free filename in `dir`. `currentName` is the entry's
// own current filename so renaming to the same name (case-insensitive)
// short-circuits. Returns the final filename or null after 1000
// collisions.
function pickAvailable(
	dir: string,
	desiredName: string,
	currentName: string
): string | null {
	if ( caseInsensitiveEq( desiredName, currentName ) ) {
		return desiredName;
	}
	const { stem, ext } = splitName( desiredName );
	for ( let i = 1; i <= 1000; i++ ) {
		const candidate =
			i === 1 ? `${ stem }${ ext }` : `${ stem }-${ i }${ ext }`;
		if ( caseInsensitiveEq( candidate, currentName ) ) {
			return candidate;
		}
		if ( ! fs.existsSync( path.join( dir, candidate ) ) ) {
			return candidate;
		}
	}
	return null;
}

export const resourcesRename = defineChannel( {
	name: IpcChannels.resourcesRename,
	input: z.object( {
		projectId: z.string().min( 1 ),
		folder: z.enum( RESOURCE_FOLDERS ),
		relPath: z.string().min( 1 ),
		desired: z.string().min( 1 ),
	} ),
	handle: ( {
		projectId,
		folder,
		relPath,
		desired,
	} ): ResourceRenameResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const folderRoot = path.resolve( project.path, folder );
		const oldFull = resolveInside(
			project.path,
			path.join( folder, relPath )
		);
		if (
			! oldFull ||
			( oldFull !== folderRoot &&
				! oldFull.startsWith( folderRoot + path.sep ) )
		) {
			return { ok: false, reason: 'not-found' };
		}
		let stat: fs.Stats;
		try {
			stat = fs.statSync( oldFull );
		} catch {
			return { ok: false, reason: 'not-found' };
		}
		if ( stat.isDirectory() ) {
			const currentName = path.basename( oldFull );
			const parentDir = path.dirname( oldFull );
			const stem = sanitizeStem( desired, false );
			if ( ! stem ) {
				return { ok: false, reason: 'invalid-name' };
			}
			const picked = pickAvailable( parentDir, stem, currentName );
			if ( ! picked ) {
				return { ok: false, reason: 'collision' };
			}
			if ( caseInsensitiveEq( picked, currentName ) ) {
				return { ok: true, relPath, name: currentName };
			}
			const newFull = path.join( parentDir, picked );
			try {
				fs.renameSync( oldFull, newFull );
			} catch {
				return { ok: false, reason: 'io-error' };
			}
			const newRelPath = path.relative( folderRoot, newFull );
			return { ok: true, relPath: newRelPath, name: picked };
		}

		const isMd = /\.md$/i.test( path.basename( oldFull ) );
		const stem = sanitizeStem( desired, isMd );
		if ( ! stem ) {
			return { ok: false, reason: 'invalid-name' };
		}
		const currentName = path.basename( oldFull );
		const parentDir = path.dirname( oldFull );
		const { ext } = splitName( currentName );
		const desiredName = isMd ? `${ stem }.md` : `${ stem }${ ext }`;
		const picked = pickAvailable( parentDir, desiredName, currentName );
		if ( ! picked ) {
			return { ok: false, reason: 'collision' };
		}
		if ( caseInsensitiveEq( picked, currentName ) ) {
			return { ok: true, relPath, name: currentName };
		}
		const newFull = path.join( parentDir, picked );
		try {
			fs.renameSync( oldFull, newFull );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		const newRelPath = path.relative( folderRoot, newFull );
		if ( folder === 'drafts' ) {
			try {
				remapDraftRelPath( project.path, relPath, newRelPath );
			} catch {
				// Best-effort — see notes-rename.ts.
			}
		}
		return { ok: true, relPath: newRelPath, name: picked };
	},
} );
