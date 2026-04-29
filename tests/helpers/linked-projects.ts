import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type SeedProject = {
	id: string;
	label: string;
	path: string;
};

export type LinkedProjectsFixture = {
	userDataDir: string;
	projects: SeedProject[];
	cleanup: () => void;
};

// Files to seed under a project's `drafts/` (or other) folders before the
// app starts. Keys are relative paths (e.g. `drafts/foo.md`); values are the
// file contents. Folders are created lazily.
export type SeedFiles = Record< string, string >;

export function seedLinkedProjects(
	projectCount = 1,
	files: SeedFiles | SeedFiles[] = {}
): LinkedProjectsFixture {
	const filesPerProject: SeedFiles[] = Array.isArray( files )
		? files
		: [ files ];
	const userDataDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'studio-write-ud-' )
	);
	const projects: SeedProject[] = [];
	for ( let i = 0; i < projectCount; i++ ) {
		const projectPath = fs.mkdtempSync(
			path.join( os.tmpdir(), `studio-write-project-${ i }-` )
		);
		const seedFiles = filesPerProject[ i ] ?? filesPerProject[ 0 ] ?? {};
		for ( const [ relPath, contents ] of Object.entries( seedFiles ) ) {
			const target = path.join( projectPath, relPath );
			fs.mkdirSync( path.dirname( target ), { recursive: true } );
			fs.writeFileSync( target, contents, 'utf-8' );
		}
		projects.push( {
			id: `seed-${ i }`,
			label: path.basename( projectPath ),
			path: projectPath,
		} );
	}
	fs.writeFileSync(
		path.join( userDataDir, 'projects.json' ),
		JSON.stringify( { projects }, null, 2 ),
		'utf-8'
	);
	return {
		userDataDir,
		projects,
		cleanup: () => {
			try {
				fs.rmSync( userDataDir, { recursive: true, force: true } );
			} catch {
				/* ignore */
			}
			for ( const p of projects ) {
				try {
					fs.rmSync( p.path, { recursive: true, force: true } );
				} catch {
					/* ignore */
				}
			}
		},
	};
}
