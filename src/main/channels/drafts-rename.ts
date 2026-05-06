import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { remapDraftRelPath } from './utils/chat-store';
import { pickAvailableSlug, slugifyTitle } from './utils/draft-slug';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

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
// auto-rename and manual rename produce identical on-disk shapes. The only
// difference is the `autoRename` frontmatter flag: manual rename writes
// `autoRename: false` to pin the filename; auto-rename leaves frontmatter
// alone (and removes the field if a previous manual rename had set it,
// which can't happen via the UI today but is defensive against hand edits).
// Cross-cuts:
//   - moves the .md file on disk
//   - sets/clears frontmatter.autoRename
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
		// Manual rename writes `autoRename: false` to frontmatter. Auto-rename
		// leaves the field absent (and clears it if a previous manual rename
		// had set it).
		markManual: z.boolean(),
		folder: z.enum( [ 'drafts', 'done' ] ).default( 'drafts' ),
	} ),
	handle: ( {
		projectId,
		relPath,
		desired,
		markManual,
		folder,
	} ): DraftRenameResult => {
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		const folderRoot = path.resolve( project.path, folder );
		const oldFull = resolveInside(
			project.path,
			path.join( folder, relPath )
		);
		if (
			! oldFull ||
			( oldFull !== folderRoot &&
				! oldFull.startsWith( folderRoot + path.sep ) )
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
		const picked = pickAvailableSlug( folderRoot, slug, relPath );
		if ( ! picked ) {
			return { ok: false, reason: 'collision' };
		}
		// Same name (case-insensitive on macOS): no rename needed, just
		// update the autoRename flag if this was a manual rename so the
		// user's "lock the name" intent persists.
		if ( picked === relPath ) {
			if ( markManual ) {
				const stamped = setAutoRenameFlag( oldFull, true );
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
		const newFull = path.join( folderRoot, picked );
		try {
			fs.renameSync( oldFull, newFull );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		// Update the renamed file's frontmatter: manual rename writes
		// `autoRename: false` (filename is now user-locked); auto-rename
		// clears the field if it was somehow set, otherwise no-ops.
		const stamped = setAutoRenameFlag( newFull, markManual );
		if ( ! stamped ) {
			// Rollback the rename to keep the on-disk state consistent —
			// otherwise we'd have a renamed file with stale frontmatter and
			// no record-update to follow.
			try {
				fs.renameSync( newFull, oldFull );
			} catch {
				// If rollback fails the worst case is one file with the
				// autoRename field in the wrong shape; the next title edit
				// (or manual rename) will reconcile it.
			}
			return { ok: false, reason: 'io-error' };
		}
		// Retarget chat metadata + jsonl. Best-effort: if this throws the
		// rename has already happened on disk, but chats are at most slightly
		// out of date and the next chat-load will surface it. Only drafts
		// renames touch chats — chat metadata records draft paths, not done
		// paths, so a done-folder rename has nothing to remap.
		if ( folder === 'drafts' ) {
			try {
				remapDraftRelPath( project.path, relPath, picked );
			} catch {
				// Swallow — see comment above.
			}
		}
		return { ok: true, relPath: picked, mtime: stamped.mtime };
	},
} );

// Reconciles `autoRename` in a draft's frontmatter. `suppress=true` writes
// `autoRename: false` (user has pinned the filename); `suppress=false`
// removes the field if present so the default "auto-rename on" behaviour
// resumes. Returns the post-write mtime, or the current mtime when no
// write was needed, or null on any IO failure.
function setAutoRenameFlag(
	fullPath: string,
	suppress: boolean
): { mtime: number } | null {
	let raw: string;
	try {
		raw = fs.readFileSync( fullPath, 'utf-8' );
	} catch {
		return null;
	}
	const parsed = matter( raw );
	const data = parsed.data as Record< string, unknown >;
	const hasField = 'autoRename' in data;
	const currentlySuppressed = data.autoRename === false;
	if ( suppress === currentlySuppressed && ( ! suppress || hasField ) ) {
		try {
			const stat = fs.statSync( fullPath );
			return { mtime: stat.mtimeMs };
		} catch {
			return null;
		}
	}
	const nextData: Record< string, unknown > = { ...data };
	if ( suppress ) {
		nextData.autoRename = false;
	} else {
		delete nextData.autoRename;
	}
	const next = matter.stringify( parsed.content, nextData );
	try {
		fs.writeFileSync( fullPath, next, 'utf-8' );
		const stat = fs.statSync( fullPath );
		return { mtime: stat.mtimeMs };
	} catch {
		return null;
	}
}
