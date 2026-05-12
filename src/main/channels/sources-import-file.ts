import fs from 'node:fs';
import path from 'node:path';

import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const SOURCES_FOLDER = 'sources';
// Same ceiling as notes:write. Bigger files can still be added by the
// agent via tool calls; the inline copy path stays conservative so we
// don't slurp huge binaries into the main process.
const MAX_BYTES = 25_000_000;

export type SourcesImportFileResult =
	| { ok: true; relPath: string; fileName: string }
	| {
			ok: false;
			reason: 'canceled' | 'not-found' | 'too-large' | 'io-error';
	  };

function splitName( fileName: string ): { stem: string; ext: string } {
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

export const sourcesImportFile = defineChannel( {
	name: IpcChannels.sourcesImportFile,
	input: z.object( {
		projectId: z.string().min( 1 ),
	} ),
	handle: async (
		{ projectId },
		event
	): Promise< SourcesImportFileResult > => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const parent = BrowserWindow.fromWebContents( event.sender );
		const options: Electron.OpenDialogOptions = {
			defaultPath: project.path,
			properties: [ 'openFile' ],
		};
		const result = parent
			? await dialog.showOpenDialog( parent, options )
			: await dialog.showOpenDialog( options );
		if ( result.canceled || result.filePaths.length === 0 ) {
			return { ok: false, reason: 'canceled' };
		}
		const sourcePath = result.filePaths[ 0 ];
		let stat: fs.Stats;
		try {
			stat = fs.statSync( sourcePath );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		if ( ! stat.isFile() ) {
			return { ok: false, reason: 'io-error' };
		}
		if ( stat.size > MAX_BYTES ) {
			return { ok: false, reason: 'too-large' };
		}
		const sourcesDir = path.resolve( project.path, SOURCES_FOLDER );
		try {
			fs.mkdirSync( sourcesDir, { recursive: true } );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		const originalName = path.basename( sourcePath );
		const picked = pickAvailableFileName( sourcesDir, originalName );
		if ( ! picked ) {
			return { ok: false, reason: 'io-error' };
		}
		const target = resolveInside(
			project.path,
			path.join( SOURCES_FOLDER, picked )
		);
		if ( ! target ) {
			return { ok: false, reason: 'io-error' };
		}
		// Folder-root containment, matching notes-write — protects against
		// a `..` slipping through the basename even after `pickAvailableFileName`.
		const folderRoot = path.resolve( project.path, SOURCES_FOLDER );
		if (
			target !== folderRoot &&
			! target.startsWith( folderRoot + path.sep )
		) {
			return { ok: false, reason: 'io-error' };
		}
		try {
			fs.copyFileSync( sourcePath, target );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		return { ok: true, relPath: picked, fileName: originalName };
	},
} );
