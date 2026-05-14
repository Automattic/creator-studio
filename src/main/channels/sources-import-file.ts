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
} from './utils/sources-paths';
import { IpcChannels } from '.';

const SOURCES_FOLDER = 'sources';

export type SourcesImportFileResult =
	| { ok: true; relPath: string; fileName: string }
	| {
			ok: false;
			reason:
				| 'canceled'
				| 'not-found'
				| 'too-large'
				| 'io-error'
				| 'invalid-path';
	  };

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
		try {
			fs.mkdirSync( resolvedDir, { recursive: true } );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		const originalName = path.basename( sourcePath );
		const picked = pickAvailableFileName( resolvedDir, originalName );
		if ( ! picked ) {
			return { ok: false, reason: 'io-error' };
		}
		const targetRel = path.relative( project.path, resolvedDir );
		const target = resolveInside(
			project.path,
			path.join( targetRel, picked )
		);
		if (
			! target ||
			( target !== resolvedDir &&
				! target.startsWith( resolvedDir + path.sep ) )
		) {
			return { ok: false, reason: 'io-error' };
		}
		try {
			fs.copyFileSync( sourcePath, target );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		// `relPath` is relative to the `sources/` group root so the renderer
		// (which keys previews by group + relPath) can resolve the new file
		// regardless of which subfolder it lives in.
		const relPath = path.relative( sourcesRoot, target );
		return { ok: true, relPath, fileName: originalName };
	},
} );
