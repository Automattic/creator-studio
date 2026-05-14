import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { remapDraftRelPath } from './utils/chat-store';
import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { pickAvailableFileName, resolveInside } from './utils/sources-paths';
import { IpcChannels } from '.';

const FOLDERS = [ 'sources', 'drafts', 'done' ] as const;
type GroupFolder = ( typeof FOLDERS )[ number ];

export type ResourcesMoveItemResult =
	| { ok: true; oldRelPath: string; newRelPath: string }
	| {
			ok: false;
			oldRelPath: string;
			reason:
				| 'not-found'
				| 'invalid-path'
				| 'into-own-descendant'
				| 'collision'
				| 'io-error';
	  };

export type ResourcesMoveResult = {
	results: ResourcesMoveItemResult[];
};

// Move one or more items inside a single group. Per-item results so a partial
// failure (one collision, say) doesn't abort the rest. Cross-group moves are
// rejected up front — v1 only supports intra-group moves to sidestep stale
// chat-attachment references that point at the old folder.
//
// For drafts→drafts moves, chat metadata is remapped after each rename so
// pending attachments keep resolving. See `remapDraftRelPath` for the on-disk
// side-effects (chats.json + chats/*.jsonl rewrites).
export const resourcesMove = defineChannel( {
	name: IpcChannels.resourcesMove,
	input: z.object( {
		projectId: z.string().min( 1 ),
		items: z
			.array(
				z.object( {
					folder: z.enum( FOLDERS ),
					relPath: z.string().min( 1 ),
					name: z.string().min( 1 ),
					kind: z.enum( [ 'file', 'dir' ] ),
				} )
			)
			.min( 1 ),
		destFolder: z.enum( FOLDERS ),
		// Destination directory relative to the project root, e.g.
		// "sources/Logs". Must resolve inside `<destFolder>/`.
		destSubPath: z.string().min( 1 ),
	} ),
	handle: ( {
		projectId,
		items,
		destFolder,
		destSubPath,
	} ): ResourcesMoveResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return {
				results: items.map( ( it ) => ( {
					ok: false,
					oldRelPath: it.relPath,
					reason: 'not-found' as const,
				} ) ),
			};
		}
		const groupRoot = path.resolve( project.path, destFolder );
		const destDir = resolveInside( project.path, destSubPath );
		if (
			! destDir ||
			( destDir !== groupRoot &&
				! destDir.startsWith( groupRoot + path.sep ) )
		) {
			return {
				results: items.map( ( it ) => ( {
					ok: false,
					oldRelPath: it.relPath,
					reason: 'invalid-path' as const,
				} ) ),
			};
		}
		try {
			fs.mkdirSync( destDir, { recursive: true } );
		} catch {
			return {
				results: items.map( ( it ) => ( {
					ok: false,
					oldRelPath: it.relPath,
					reason: 'io-error' as const,
				} ) ),
			};
		}
		const results: ResourcesMoveItemResult[] = [];
		for ( const it of items ) {
			results.push(
				moveOne( {
					projectPath: project.path,
					sourceFolder: it.folder,
					destFolder,
					destDir,
					relPath: it.relPath,
					name: it.name,
					kind: it.kind,
				} )
			);
		}
		return { results };
	},
} );

function moveOne( {
	projectPath,
	sourceFolder,
	destFolder,
	destDir,
	relPath,
	name,
	kind,
}: {
	projectPath: string;
	sourceFolder: GroupFolder;
	destFolder: GroupFolder;
	destDir: string;
	relPath: string;
	name: string;
	kind: 'file' | 'dir';
} ): ResourcesMoveItemResult {
	// v1: cross-group moves rejected — the renderer pre-filters but be
	// defensive against direct IPC callers.
	if ( sourceFolder !== destFolder ) {
		return { ok: false, oldRelPath: relPath, reason: 'invalid-path' };
	}
	const sourceRoot = path.resolve( projectPath, sourceFolder );
	const sourceFull = resolveInside(
		projectPath,
		path.join( sourceFolder, relPath )
	);
	if (
		! sourceFull ||
		( sourceFull !== sourceRoot &&
			! sourceFull.startsWith( sourceRoot + path.sep ) )
	) {
		return { ok: false, oldRelPath: relPath, reason: 'invalid-path' };
	}
	if ( ! fs.existsSync( sourceFull ) ) {
		return { ok: false, oldRelPath: relPath, reason: 'not-found' };
	}
	// No-op move: destination is the file's current parent directory.
	if ( path.dirname( sourceFull ) === destDir ) {
		return { ok: true, oldRelPath: relPath, newRelPath: relPath };
	}
	// Block moving a folder into itself or any of its descendants.
	if (
		kind === 'dir' &&
		( destDir === sourceFull ||
			destDir.startsWith( sourceFull + path.sep ) )
	) {
		return {
			ok: false,
			oldRelPath: relPath,
			reason: 'into-own-descendant',
		};
	}
	const picked = pickAvailableFileName( destDir, name );
	if ( ! picked ) {
		return { ok: false, oldRelPath: relPath, reason: 'collision' };
	}
	const target = path.join( destDir, picked );
	try {
		fs.renameSync( sourceFull, target );
	} catch ( err ) {
		// Cross-device — copy + unlink. Rare inside one project but possible
		// under nested mountpoints or symlinks.
		if (
			err &&
			typeof err === 'object' &&
			( err as { code?: string } ).code === 'EXDEV'
		) {
			try {
				if ( kind === 'dir' ) {
					fs.cpSync( sourceFull, target, { recursive: true } );
					fs.rmSync( sourceFull, { recursive: true, force: true } );
				} else {
					fs.copyFileSync( sourceFull, target );
					fs.unlinkSync( sourceFull );
				}
			} catch {
				return { ok: false, oldRelPath: relPath, reason: 'io-error' };
			}
		} else {
			return { ok: false, oldRelPath: relPath, reason: 'io-error' };
		}
	}
	const newRelPath = path.relative( sourceRoot, target );
	// Keep chat attachments pointing at the new location. Best-effort: a
	// remap failure leaves chats slightly stale but the move on disk has
	// already succeeded, and the next chat-load surfaces it.
	if ( sourceFolder === 'drafts' && destFolder === 'drafts' ) {
		try {
			remapDraftRelPath( projectPath, relPath, newRelPath );
		} catch {
			// Swallow — see comment above.
		}
	}
	return { ok: true, oldRelPath: relPath, newRelPath };
}
