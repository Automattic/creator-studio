import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const DRAFTS_FOLDER = 'drafts';
const DONE_FOLDER = 'done';

export type DraftMarkDoneResult =
	| { ok: true; relPath: string }
	| { ok: false; reason: 'not-found' | 'collision' | 'io-error' };

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

// Picks an available filename under <doneRoot>. If `name` is free, uses it
// verbatim; otherwise appends `-2`, `-3`, … up to 1000 tries before giving
// up. Returns null when 1000 collisions stack — the caller surfaces this as
// `collision`. The case-folded comparison matches APFS's default.
function pickAvailableName( doneRoot: string, name: string ): string | null {
	const exists = ( candidate: string ): boolean => {
		try {
			return fs.existsSync( path.join( doneRoot, candidate ) );
		} catch {
			return false;
		}
	};
	if ( ! exists( name ) ) {
		return name;
	}
	const ext = path.extname( name );
	const stem = name.slice( 0, name.length - ext.length );
	for ( let i = 2; i <= 1000; i++ ) {
		const candidate = `${ stem }-${ i }${ ext }`;
		if ( ! exists( candidate ) ) {
			return candidate;
		}
	}
	return null;
}

// Move a draft from <project>/drafts/<rel> to <project>/done/<rel>. The done
// counterpart's directory tree is created on demand; on a name collision we
// auto-suffix `-2`, `-3`, … rather than refusing — the action is a one-click
// Mark as done, and forcing the user to rename mid-flight would be hostile.
//
// Chat metadata (draftRelPath in chats.json) and any DraftAttachment entries
// in chat jsonl files are intentionally NOT remapped: those records describe
// a draft whose `folder` is implicitly `'drafts'`, and once the file has
// moved to `'done'` they no longer match. Future work can either follow the
// move (set folder='done' on remap) or surface the orphan in the chat UI.
export const draftsMarkDone = defineChannel( {
	name: IpcChannels.draftsMarkDone,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
	} ),
	handle: ( { projectId, relPath } ): DraftMarkDoneResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const draftsRoot = path.resolve( project.path, DRAFTS_FOLDER );
		const sourceFull = resolveInside(
			project.path,
			path.join( DRAFTS_FOLDER, relPath )
		);
		if (
			! sourceFull ||
			( sourceFull !== draftsRoot &&
				! sourceFull.startsWith( draftsRoot + path.sep ) )
		) {
			return { ok: false, reason: 'not-found' };
		}
		if ( ! fs.existsSync( sourceFull ) ) {
			return { ok: false, reason: 'not-found' };
		}

		const doneRoot = path.resolve( project.path, DONE_FOLDER );
		try {
			fs.mkdirSync( doneRoot, { recursive: true } );
		} catch {
			return { ok: false, reason: 'io-error' };
		}

		const targetName = path.basename( relPath );
		const picked = pickAvailableName( doneRoot, targetName );
		if ( ! picked ) {
			return { ok: false, reason: 'collision' };
		}
		const targetFull = path.join( doneRoot, picked );

		try {
			fs.renameSync( sourceFull, targetFull );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		return { ok: true, relPath: picked };
	},
} );
