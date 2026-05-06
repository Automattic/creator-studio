import fs from 'node:fs';
import path from 'node:path';

export { slugifyTitle } from './slugify';

function caseInsensitiveEq( a: string, b: string ): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

// Pick a filename for the desired slug, suffixing `-2`, `-3`, … on collision.
// Returns the desired name unchanged when the only collision on disk is the
// draft's own current file (case-insensitive — macOS default APFS folds
// case). Returns null when 1000 suffixes still collide.
export function pickAvailableSlug(
	draftsDir: string,
	desired: string,
	currentRelPath: string | null
): string | null {
	const desiredFile = `${ desired }.md`;
	const isSelf = ( name: string ): boolean =>
		currentRelPath !== null && caseInsensitiveEq( name, currentRelPath );
	const exists = ( name: string ): boolean => {
		try {
			return fs.existsSync( path.join( draftsDir, name ) );
		} catch {
			return false;
		}
	};
	if ( isSelf( desiredFile ) || ! exists( desiredFile ) ) {
		return desiredFile;
	}
	for ( let i = 2; i <= 1000; i++ ) {
		const name = `${ desired }-${ i }.md`;
		if ( isSelf( name ) || ! exists( name ) ) {
			return name;
		}
	}
	return null;
}
