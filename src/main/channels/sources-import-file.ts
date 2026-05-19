import fs from 'node:fs';
import path from 'node:path';

import { BrowserWindow, dialog } from 'electron';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import {
	MAX_BYTES,
	pickAvailableFileName,
	resolveInside,
	walkFiles,
} from './utils/sources-paths';
import { IpcChannels } from '.';

const SOURCES_FOLDER = 'sources';

export type SourcesImportFileOneResult =
	| { ok: true; relPath: string; fileName: string }
	| { ok: false; fileName: string; reason: 'too-large' | 'io-error' };

export type SourcesImportFileResult =
	| {
			ok: false;
			reason: 'canceled' | 'not-found' | 'io-error' | 'invalid-path';
	  }
	| { ok: true; results: SourcesImportFileOneResult[] };

// Re-exported for tests + callers that still import from here.
export { pickAvailableFileName };

export const sourcesImportFile = defineChannel( {
	name: IpcChannels.sourcesImportFile,
	input: z.object( {
		projectId: z.string().min( 1 ),
		// Destination directory relative to the project root. Must resolve
		// inside `sources/`. Defaults to the group root so legacy callers
		// (the top-level Sources menu) keep working unchanged.
		subPath: z.string().optional(),
	} ),
	handle: async (
		{ projectId, subPath },
		event
	): Promise< SourcesImportFileResult > => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const sourcesRoot = path.resolve( project.path, SOURCES_FOLDER );
		const resolvedDir = subPath
			? resolveInside( project.path, subPath )
			: sourcesRoot;
		if (
			! resolvedDir ||
			( resolvedDir !== sourcesRoot &&
				! resolvedDir.startsWith( sourcesRoot + path.sep ) )
		) {
			return { ok: false, reason: 'invalid-path' };
		}
		const parent = BrowserWindow.fromWebContents( event.sender );
		const options: Electron.OpenDialogOptions = {
			defaultPath: project.path,
			properties: [ 'openFile', 'openDirectory', 'multiSelections' ],
		};
		const result = parent
			? await dialog.showOpenDialog( parent, options )
			: await dialog.showOpenDialog( options );
		if ( result.canceled || result.filePaths.length === 0 ) {
			return { ok: false, reason: 'canceled' };
		}

		// Expand selected paths: directories become all their descendant files;
		// plain files stay as-is. Each entry carries the absolute path and a
		// destination-relative path that mirrors the original folder hierarchy.
		const filesToCopy: Array< {
			absPath: string;
			destRelPath: string;
		} > = [];
		for ( const selected of result.filePaths ) {
			let stat: fs.Stats;
			try {
				stat = fs.statSync( selected );
			} catch {
				continue;
			}
			if ( stat.isFile() ) {
				filesToCopy.push( {
					absPath: selected,
					destRelPath: path.basename( selected ),
				} );
			} else if ( stat.isDirectory() ) {
				const dirName = path.basename( selected );
				for ( const entry of walkFiles( selected ) ) {
					filesToCopy.push( {
						absPath: entry.absPath,
						destRelPath: path.join( dirName, entry.relPath ),
					} );
				}
			}
		}

		try {
			fs.mkdirSync( resolvedDir, { recursive: true } );
		} catch {
			return { ok: false, reason: 'io-error' };
		}

		const results: SourcesImportFileOneResult[] = [];
		for ( const file of filesToCopy ) {
			results.push(
				importOneFile( {
					projectPath: project.path,
					sourcesRoot,
					destDir: resolvedDir,
					absPath: file.absPath,
					destRelPath: file.destRelPath,
				} )
			);
		}
		return { ok: true, results };
	},
} );

function importOneFile( {
	projectPath,
	sourcesRoot,
	destDir,
	absPath,
	destRelPath,
}: {
	projectPath: string;
	sourcesRoot: string;
	destDir: string;
	absPath: string;
	destRelPath: string;
} ): SourcesImportFileOneResult {
	const fileName = path.basename( absPath );
	let stat: fs.Stats;
	try {
		stat = fs.statSync( absPath );
	} catch {
		return { ok: false, fileName, reason: 'io-error' };
	}
	if ( stat.size > MAX_BYTES ) {
		return { ok: false, fileName, reason: 'too-large' };
	}

	// Ensure the subdirectory exists (folders selected from the dialog
	// mirror their internal hierarchy under the destination).
	const subDir = path.dirname( destRelPath );
	const targetDir =
		subDir === '.' ? destDir : resolveInside( destDir, subDir ) ?? destDir;
	try {
		fs.mkdirSync( targetDir, { recursive: true } );
	} catch {
		return { ok: false, fileName, reason: 'io-error' };
	}

	const picked = pickAvailableFileName( targetDir, fileName );
	if ( ! picked ) {
		return { ok: false, fileName, reason: 'io-error' };
	}
	const targetRel = path.relative( projectPath, targetDir );
	const target = resolveInside( projectPath, path.join( targetRel, picked ) );
	if (
		! target ||
		( target !== targetDir && ! target.startsWith( targetDir + path.sep ) )
	) {
		return { ok: false, fileName, reason: 'io-error' };
	}
	try {
		fs.copyFileSync( absPath, target );
	} catch {
		return { ok: false, fileName, reason: 'io-error' };
	}
	const relPath = path.relative( sourcesRoot, target );
	return { ok: true, relPath, fileName };
}
