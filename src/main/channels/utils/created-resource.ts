import path from 'node:path';

export type AutoOpenResource = {
	folder: 'drafts' | 'sources';
	relPath: string;
};

// Maps a file path the agent wrote to a {folder, relPath} the draft editor can
// open, or null when the file is not a markdown file inside the project's
// drafts/ or sources/ tree. `relPath` is returned relative to that group
// folder, with forward slashes — the shape the renderer and draft IPC expect.
export function classifyCreatedResource(
	projectPath: string,
	filePath: unknown
): AutoOpenResource | null {
	if ( typeof filePath !== 'string' || filePath.length === 0 ) {
		return null;
	}
	const root = path.resolve( projectPath );
	const abs = path.resolve( root, filePath );
	const rel = path.relative( root, abs );
	if (
		rel.length === 0 ||
		rel.startsWith( '..' ) ||
		path.isAbsolute( rel )
	) {
		return null;
	}
	const parts = rel.split( path.sep );
	if ( parts.length < 2 ) {
		return null;
	}
	const folder = parts[ 0 ];
	if ( folder !== 'drafts' && folder !== 'sources' ) {
		return null;
	}
	if ( ! abs.toLowerCase().endsWith( '.md' ) ) {
		return null;
	}
	return { folder, relPath: parts.slice( 1 ).join( '/' ) };
}

// Picks the single resource to auto-open after an agent turn. Returns null when
// the turn created zero or more than one — silently choosing one of several is
// worse than choosing none (issue #155). Duplicates (same file written twice)
// collapse to one so a re-write of the same new file still opens it.
export function pickAutoOpenResource(
	created: readonly AutoOpenResource[]
): AutoOpenResource | null {
	const unique = new Map< string, AutoOpenResource >();
	for ( const resource of created ) {
		unique.set( `${ resource.folder }/${ resource.relPath }`, resource );
	}
	return unique.size === 1 ? unique.values().next().value ?? null : null;
}
