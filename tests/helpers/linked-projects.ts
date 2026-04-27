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

export function seedLinkedProjects( projectCount = 1 ): LinkedProjectsFixture {
	const userDataDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'creator-studio-ud-' )
	);
	const projects: SeedProject[] = [];
	for ( let i = 0; i < projectCount; i++ ) {
		const projectPath = fs.mkdtempSync(
			path.join( os.tmpdir(), `creator-studio-project-${ i }-` )
		);
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
