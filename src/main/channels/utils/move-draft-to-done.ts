import fs from 'node:fs';
import path from 'node:path';

const DRAFTS_FOLDER = 'drafts';
const DONE_FOLDER = 'done';

export type MoveDraftToDoneResult =
	| { ok: true; relPath: string }
	| { ok: false; reason: 'not-found' | 'collision' | 'io-error' };

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

// Picks an available filename under <doneRoot>. If `name` is free we
// use it verbatim; otherwise append `-2`, `-3`, … up to 1000 tries
// before giving up — at which point the caller surfaces `collision`.
function pickAvailableName( doneRoot: string, name: string ): string | null {
	const exists = ( candidate: string ): boolean => {
		try {
			return fs.existsSync( path.join( doneRoot, candidate ) );
		} catch {
			return false;
		}
	};
	if ( ! exists( name ) ) {
		return name;
	}
	const ext = path.extname( name );
	const stem = name.slice( 0, name.length - ext.length );
	for ( let i = 2; i <= 1000; i++ ) {
		const candidate = `${ stem }-${ i }${ ext }`;
		if ( ! exists( candidate ) ) {
			return candidate;
		}
	}
	return null;
}

// Move <project>/drafts/<relPath> → <project>/done/<relPath>. Mirrors
// the behavior of the `drafts:markDone` channel — the channel now
// delegates here so the WordPress publish flow can perform the same
// move after a successful post without duplicating logic.
export function moveDraftToDone(
	projectPath: string,
	relPath: string
): MoveDraftToDoneResult {
	const draftsRoot = path.resolve( projectPath, DRAFTS_FOLDER );
	const sourceFull = resolveInside(
		projectPath,
		path.join( DRAFTS_FOLDER, relPath )
	);
	if (
		! sourceFull ||
		( sourceFull !== draftsRoot &&
			! sourceFull.startsWith( draftsRoot + path.sep ) )
	) {
		return { ok: false, reason: 'not-found' };
	}
	if ( ! fs.existsSync( sourceFull ) ) {
		return { ok: false, reason: 'not-found' };
	}

	const doneRoot = path.resolve( projectPath, DONE_FOLDER );
	try {
		fs.mkdirSync( doneRoot, { recursive: true } );
	} catch {
		return { ok: false, reason: 'io-error' };
	}

	const targetName = path.basename( relPath );
	const picked = pickAvailableName( doneRoot, targetName );
	if ( ! picked ) {
		return { ok: false, reason: 'collision' };
	}
	const targetFull = path.join( doneRoot, picked );

	try {
		fs.renameSync( sourceFull, targetFull );
	} catch {
		return { ok: false, reason: 'io-error' };
	}
	return { ok: true, relPath: picked };
}
