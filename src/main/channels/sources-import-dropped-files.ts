import fs from 'node:fs';
import path from 'node:path';

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

export type SourcesImportDroppedFileResult =
	| { ok: true; absPath: string; relPath: string; fileName: string }
	| {
			ok: false;
			absPath: string;
			reason:
				| 'not-found'
				| 'is-directory'
				| 'too-large'
				| 'io-error'
				| 'invalid-path';
	  };

export type SourcesImportDroppedFilesResult = {
	results: SourcesImportDroppedFileResult[];
};

// Counterpart to `sources:importFile` (which opens a dialog). This variant
// accepts absolute paths the renderer pulled from `dataTransfer.files` via
// `webUtils.getPathForFile`. Used by the drag-drop flow: the renderer never
// reads bytes itself — just hands paths to main, which does the copy.
//
// `subPath` is the destination directory relative to the project root. It
// must resolve inside `sources/` (no `..`, no symlink escapes). Subfolders
// are allowed so drops on folder cards land in the folder the user picked.
export const sourcesImportDroppedFiles = defineChannel( {
	name: IpcChannels.sourcesImportDroppedFiles,
	input: z.object( {
		projectId: z.string().min( 1 ),
		subPath: z.string().min( 1 ),
		paths: z.array( z.string().min( 1 ) ).min( 1 ),
	} ),
	handle: ( {
		projectId,
		subPath,
		paths,
	} ): SourcesImportDroppedFilesResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return {
				results: paths.map( ( p ) => ( {
					ok: false,
					absPath: p,
					reason: 'not-found' as const,
				} ) ),
			};
		}
		const sourcesRoot = path.resolve( project.path, SOURCES_FOLDER );
		const resolvedDir = resolveInside( project.path, subPath );
		if (
			! resolvedDir ||
			( resolvedDir !== sourcesRoot &&
				! resolvedDir.startsWith( sourcesRoot + path.sep ) )
		) {
			return {
				results: paths.map( ( p ) => ( {
					ok: false,
					absPath: p,
					reason: 'invalid-path' as const,
				} ) ),
			};
		}
		try {
			fs.mkdirSync( resolvedDir, { recursive: true } );
		} catch {
			return {
				results: paths.map( ( p ) => ( {
					ok: false,
					absPath: p,
					reason: 'io-error' as const,
				} ) ),
			};
		}
		const results: SourcesImportDroppedFileResult[] = [];
		for ( const absPath of paths ) {
			results.push(
				importOne( {
					projectPath: project.path,
					sourcesRoot,
					destDir: resolvedDir,
					absPath,
				} )
			);
		}
		return { results };
	},
} );

function importOne( {
	projectPath,
	sourcesRoot,
	destDir,
	absPath,
}: {
	projectPath: string;
	sourcesRoot: string;
	destDir: string;
	absPath: string;
} ): SourcesImportDroppedFileResult {
	let stat: fs.Stats;
	try {
		stat = fs.statSync( absPath );
	} catch {
		return { ok: false, absPath, reason: 'not-found' };
	}
	if ( stat.isDirectory() ) {
		return { ok: false, absPath, reason: 'is-directory' };
	}
	if ( ! stat.isFile() ) {
		return { ok: false, absPath, reason: 'io-error' };
	}
	if ( stat.size > MAX_BYTES ) {
		return { ok: false, absPath, reason: 'too-large' };
	}
	const originalName = path.basename( absPath );
	const picked = pickAvailableFileName( destDir, originalName );
	if ( ! picked ) {
		return { ok: false, absPath, reason: 'io-error' };
	}
	const targetRel = path.relative( projectPath, destDir );
	const target = resolveInside( projectPath, path.join( targetRel, picked ) );
	if (
		! target ||
		( target !== destDir && ! target.startsWith( destDir + path.sep ) )
	) {
		return { ok: false, absPath, reason: 'io-error' };
	}
	try {
		fs.copyFileSync( absPath, target );
	} catch {
		return { ok: false, absPath, reason: 'io-error' };
	}
	const relPath = path.relative( sourcesRoot, target );
	return { ok: true, absPath, relPath, fileName: originalName };
}
