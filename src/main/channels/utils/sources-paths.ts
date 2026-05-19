import fs from 'node:fs';
import path from 'node:path';

// Common ceiling for inline file copies (import + drag-drop). Bigger files
// can still be added via tool calls; the renderer-driven path stays
// conservative so the main process doesn't slurp huge binaries.
export const MAX_BYTES = 25_000_000;

export function splitName( fileName: string ): { stem: string; ext: string } {
	// Hidden files (".env", ".gitignore") have no real extension — treat the
	// whole name as the stem so the dedup suffix lands at the end.
	if ( fileName.startsWith( '.' ) && fileName.lastIndexOf( '.' ) === 0 ) {
		return { stem: fileName, ext: '' };
	}
	const dot = fileName.lastIndexOf( '.' );
	if ( dot <= 0 || dot === fileName.length - 1 ) {
		return { stem: fileName, ext: '' };
	}
	return { stem: fileName.slice( 0, dot ), ext: fileName.slice( dot ) };
}

// `foo.png` → `foo.png`, then `foo-2.png`, `foo-3.png`, … if the target
// already exists. Returns null after 1000 collisions (matches the cap in
// utils/draft-slug.ts).
export function pickAvailableFileName(
	dir: string,
	fileName: string
): string | null {
	const { stem, ext } = splitName( fileName );
	for ( let i = 1; i <= 1000; i++ ) {
		const candidate =
			i === 1 ? `${ stem }${ ext }` : `${ stem }-${ i }${ ext }`;
		if ( ! fs.existsSync( path.join( dir, candidate ) ) ) {
			return candidate;
		}
	}
	return null;
}

// Returns the absolute path of `subPath` resolved against `root`, but only
// if it stays inside `root`. Used everywhere we accept a project-relative
// path from the renderer to guard against `..` escapes and symlink shenanigans.
export function resolveInside( root: string, subPath: string ): string | null {
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

// Recursively lists every regular file under `dir`, skipping hidden entries
// (dot-prefixed). Each result has the absolute path and a relative path from
// `dir` — the caller uses the relative part to mirror the folder hierarchy
// inside the destination.
export function walkFiles(
	dir: string
): Array< { absPath: string; relPath: string } > {
	const results: Array< { absPath: string; relPath: string } > = [];
	function walk( current: string, rel: string ): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync( current, { withFileTypes: true } );
		} catch {
			return;
		}
		for ( const entry of entries ) {
			if ( entry.name.startsWith( '.' ) ) {
				continue;
			}
			const abs = path.join( current, entry.name );
			const entryRel = rel ? path.join( rel, entry.name ) : entry.name;
			if ( entry.isDirectory() ) {
				walk( abs, entryRel );
			} else if ( entry.isFile() ) {
				results.push( { absPath: abs, relPath: entryRel } );
			}
		}
	}
	walk( dir, '' );
	return results;
}
