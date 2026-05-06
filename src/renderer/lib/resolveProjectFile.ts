// Resolves an absolute file path emitted by a `Write` (or similar) tool back
// to the resource folder it belongs to. Returns null when the path is outside
// the project, outside the three watched folders, or otherwise unparseable —
// callers use that to skip rendering a "created file" card.

const RESOURCE_FOLDERS = [ 'sources', 'drafts', 'published' ] as const;
type ResourceFolder = ( typeof RESOURCE_FOLDERS )[ number ];

export type ResolvedProjectFile = {
	folder: ResourceFolder;
	relPath: string;
	name: string;
};

export function resolveProjectFile(
	filePath: string,
	projectPath: string
): ResolvedProjectFile | null {
	if ( typeof filePath !== 'string' || filePath.length === 0 ) {
		return null;
	}
	const root = projectPath.replace( /\/+$/, '' );
	if ( ! filePath.startsWith( `${ root }/` ) ) {
		return null;
	}
	const rel = filePath.slice( root.length + 1 );
	const slashIdx = rel.indexOf( '/' );
	if ( slashIdx === -1 ) {
		return null;
	}
	const folder = rel.slice( 0, slashIdx );
	if ( ! isResourceFolder( folder ) ) {
		return null;
	}
	const relPath = rel.slice( slashIdx + 1 );
	if ( relPath.length === 0 ) {
		return null;
	}
	const last = relPath.split( '/' ).pop();
	if ( ! last ) {
		return null;
	}
	return { folder, relPath, name: last };
}

function isResourceFolder( s: string ): s is ResourceFolder {
	return ( RESOURCE_FOLDERS as readonly string[] ).includes( s );
}
