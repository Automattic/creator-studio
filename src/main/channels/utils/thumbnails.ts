import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Lives inside the project so a folder copy/sync carries thumbs along, and
// so the existing `studio-asset://` protocol — which serves any in-project
// path — can deliver them without a new scheme.
export const THUMBS_DIR_REL = '.studio-write/thumbs';

// Key the cache by `(projectRelPath, mtime)`. A file edit (mtime change)
// produces a fresh key, so the thumb naturally invalidates without a sweep
// of stale png/.failed entries. Old keys do leak; a periodic cleaner is
// out of scope for v1.
export function thumbHash( projectRelPath: string, mtimeMs: number ): string {
	return crypto
		.createHash( 'sha1' )
		.update( `${ projectRelPath }@${ Math.floor( mtimeMs ) }` )
		.digest( 'hex' )
		.slice( 0, 16 );
}

export type ThumbPaths = {
	dir: string;
	pngAbs: string;
	pngRel: string;
	failedAbs: string;
};

export function thumbPaths( projectPath: string, hash: string ): ThumbPaths {
	const dir = path.join( projectPath, THUMBS_DIR_REL );
	const file = `${ hash }.png`;
	const failed = `${ hash }.failed`;
	return {
		dir,
		pngAbs: path.join( dir, file ),
		pngRel: `${ THUMBS_DIR_REL }/${ file }`,
		failedAbs: path.join( dir, failed ),
	};
}

export type ThumbStatus = 'ready' | 'failed' | 'missing';

export function thumbStatus( projectPath: string, hash: string ): ThumbStatus {
	const t = thumbPaths( projectPath, hash );
	if ( fs.existsSync( t.pngAbs ) ) {
		return 'ready';
	}
	if ( fs.existsSync( t.failedAbs ) ) {
		return 'failed';
	}
	return 'missing';
}
