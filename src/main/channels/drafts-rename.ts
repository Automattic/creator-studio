import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { remapDraftRelPath } from './utils/chat-store';
import { pickAvailableSlug, slugifyTitle } from './utils/draft-slug';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const DRAFTS_FOLDER = 'drafts';

export type DraftRenameResult =
	| { ok: true; relPath: string; mtime: number }
	| {
			ok: false;
			reason: 'not-found' | 'invalid-name' | 'collision' | 'io-error';
	  };

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

// Rename a draft file. The desired name is normalized via slugifyTitle so
// auto-rename and manual rename produce identical on-disk shapes — the only
// difference is the `autoSlug` flag we stamp in frontmatter (false on
// manual, true on auto). Cross-cuts:
//   - moves the .md file on disk
//   - updates frontmatter.autoSlug
//   - retargets ChatMeta.draftRelPath in chats.json
//   - rewrites DraftAttachment.relPath in any user message that referenced
//     the old path
// Returns the new relPath and post-rename mtime so the renderer can refresh
// its expectedMtime guard before the next save.
export const draftsRename = defineChannel( {
	name: IpcChannels.draftsRename,
	input: z.object( {
		projectId: z.string().min( 1 ),
		relPath: z.string().min( 1 ),
		// What the user/auto-flow asked for. We sanitize via slugifyTitle, so
		// this can be a raw title or an already-clean slug.
		desired: z.string(),
		// Manual rename sets this true → autoSlug becomes false. Auto-rename
		// sets it false → autoSlug stays true.
		markManual: z.boolean(),
	} ),
	handle: ( {
		projectId,
		relPath,
		desired,
		markManual,
	} ): DraftRenameResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const draftsRoot = path.resolve( project.path, DRAFTS_FOLDER );
		const oldFull = resolveInside(
			project.path,
			path.join( DRAFTS_FOLDER, relPath )
		);
		if (
			! oldFull ||
			( oldFull !== draftsRoot &&
				! oldFull.startsWith( draftsRoot + path.sep ) )
		) {
			return { ok: false, reason: 'not-found' };
		}
		if ( ! fs.existsSync( oldFull ) ) {
			return { ok: false, reason: 'not-found' };
		}
		const slug = slugifyTitle( desired );
		if ( ! slug ) {
			return { ok: false, reason: 'invalid-name' };
		}
		const picked = pickAvailableSlug( draftsRoot, slug, relPath );
		if ( ! picked ) {
			return { ok: false, reason: 'collision' };
		}
		// Same name (case-insensitive on macOS): no rename needed, just
		// stamp the autoSlug flag if this was a manual rename so the user's
		// "lock the name" intent persists.
		if ( picked === relPath ) {
			if ( markManual ) {
				const stamped = stampAutoSlug( oldFull, false );
				if ( ! stamped ) {
					return { ok: false, reason: 'io-error' };
				}
				return {
					ok: true,
					relPath: picked,
					mtime: stamped.mtime,
				};
			}
			try {
				const stat = fs.statSync( oldFull );
				return {
					ok: true,
					relPath: picked,
					mtime: stat.mtimeMs,
				};
			} catch {
				return { ok: false, reason: 'io-error' };
			}
		}
		const newFull = path.join( draftsRoot, picked );
		try {
			fs.renameSync( oldFull, newFull );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		// Stamp autoSlug into the renamed file's frontmatter. Manual rename
		// flips it false (filename is now user-locked); auto-rename writes
		// true so legacy drafts pick up the field on first migration.
		const stamped = stampAutoSlug( newFull, ! markManual );
		if ( ! stamped ) {
			// Rollback the rename to keep the on-disk state consistent —
			// otherwise we'd have a renamed file with stale frontmatter and
			// no record-update to follow.
			try {
				fs.renameSync( newFull, oldFull );
			} catch {
				// If rollback fails the worst case is one file with
				// out-of-date autoSlug; the next title edit will fix it.
			}
			return { ok: false, reason: 'io-error' };
		}
		// Retarget chat metadata + jsonl. Best-effort: if this throws the
		// rename has already happened on disk, but chats are at most slightly
		// out of date and the next chat-load will surface it.
		try {
			remapDraftRelPath( project.path, relPath, picked );
		} catch {
			// Swallow — see comment above.
		}
		return { ok: true, relPath: picked, mtime: stamped.mtime };
	},
} );

// Reads a draft, sets `autoSlug` in its frontmatter, writes back. Returns
// the post-write mtime, or null on any IO failure.
function stampAutoSlug(
	fullPath: string,
	autoSlug: boolean
): { mtime: number } | null {
	let raw: string;
	try {
		raw = fs.readFileSync( fullPath, 'utf-8' );
	} catch {
		return null;
	}
	const parsed = matter( raw );
	const data = parsed.data as Record< string, unknown >;
	if ( data.autoSlug === autoSlug ) {
		try {
			const stat = fs.statSync( fullPath );
			return { mtime: stat.mtimeMs };
		} catch {
			return null;
		}
	}
	const next = matter.stringify( parsed.content, {
		...data,
		autoSlug,
	} );
	try {
		fs.writeFileSync( fullPath, next, 'utf-8' );
		const stat = fs.statSync( fullPath );
		return { mtime: stat.mtimeMs };
	} catch {
		return null;
	}
}
