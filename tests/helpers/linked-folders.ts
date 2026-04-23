import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type SeedFolder = {
	id: string;
	label: string;
	path: string;
};

export type LinkedFoldersFixture = {
	userDataDir: string;
	folders: SeedFolder[];
	cleanup: () => void;
};

export function seedLinkedFolders( folderCount = 1 ): LinkedFoldersFixture {
	const userDataDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'creator-studio-ud-' )
	);
	const folders: SeedFolder[] = [];
	for ( let i = 0; i < folderCount; i++ ) {
		const folderPath = fs.mkdtempSync(
			path.join( os.tmpdir(), `creator-studio-folder-${ i }-` )
		);
		folders.push( {
			id: `seed-${ i }`,
			label: path.basename( folderPath ),
			path: folderPath,
		} );
	}
	fs.writeFileSync(
		path.join( userDataDir, 'folders.json' ),
		JSON.stringify( { folders }, null, 2 ),
		'utf-8'
	);
	return {
		userDataDir,
		folders,
		cleanup: () => {
			try {
				fs.rmSync( userDataDir, { recursive: true, force: true } );
			} catch {
				/* ignore */
			}
			for ( const f of folders ) {
				try {
					fs.rmSync( f.path, { recursive: true, force: true } );
				} catch {
					/* ignore */
				}
			}
		},
	};
}
