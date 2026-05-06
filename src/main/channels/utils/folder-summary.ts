import fs from 'node:fs';
import path from 'node:path';

import { parseDraft } from './parse-draft';
import { thumbHash, thumbPaths, thumbStatus } from './thumbnails';
import type { FolderTextTile } from '../../../types';

// Mirror the renderer-side `previewKind` extension lists. Duplicated rather
// than shared because the renderer module can't be loaded from main.
const VIDEO_EXTENSIONS = [ '.mp4', '.m4v', '.webm', '.mov', '.ogv' ];
const IMAGE_EXTENSIONS = [
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.svg',
	'.avif',
];

function endsWithAny( name: string, exts: readonly string[] ): boolean {
	const lower = name.toLowerCase();
	return exts.some( ( ext ) => lower.endsWith( ext ) );
}

// Cap the per-folder stat work so a `node_modules`-shaped folder doesn't
// stall the resources panel. Folders past this size still get an
// `entryCount` (cheap dirent read), they just lose the recency fields.
const MAX_CHILDREN_TO_STAT = 100;
const MAX_THUMB_TILES = 3;

export type FolderSummary = {
	entryCount: number;
	latestChildMtime?: number;
	// Newest first; the renderer reverses for stacking order.
	childThumbPaths: string[];
	// Populated only when `childThumbPaths` is empty — the fanned card
	// still has something to show for markdown-only folders.
	childTextTiles: FolderTextTile[];
};

export function summarizeFolder( args: {
	folderAbsPath: string;
	projectPath: string;
	// Project-relative path of the folder being summarized, used as the
	// prefix when building each child's hash key.
	projectRelDir: string;
} ): FolderSummary | null {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync( args.folderAbsPath, {
			withFileTypes: true,
		} );
	} catch {
		return null;
	}
	const visible = entries.filter( ( e ) => ! e.name.startsWith( '.' ) );

	type Cand = { mtime: number; thumbPath: string };
	const candidates: Cand[] = [];
	type MdCand = { mtime: number; absPath: string; name: string };
	const mdCandidates: MdCand[] = [];
	let latestMtime: number | undefined;

	const limit = Math.min( visible.length, MAX_CHILDREN_TO_STAT );
	for ( let i = 0; i < limit; i++ ) {
		const e = visible[ i ];
		const childAbs = path.join( args.folderAbsPath, e.name );
		let mtime: number | undefined;
		try {
			mtime = fs.statSync( childAbs ).mtimeMs;
		} catch {
			continue;
		}
		if (
			latestMtime === undefined ||
			( mtime !== undefined && mtime > latestMtime )
		) {
			latestMtime = mtime;
		}
		if ( e.isDirectory() || mtime === undefined ) {
			continue;
		}
		const childRel = args.projectRelDir
			? `${ args.projectRelDir }/${ e.name }`
			: e.name;
		// Image files are served directly via the asset protocol — no
		// pre-rendered thumb needed. PDFs/videos require a cached PNG.
		if ( endsWithAny( e.name, IMAGE_EXTENSIONS ) ) {
			candidates.push( { mtime, thumbPath: childRel } );
			continue;
		}
		const thumbnailable =
			e.name.toLowerCase().endsWith( '.pdf' ) ||
			endsWithAny( e.name, VIDEO_EXTENSIONS );
		if ( thumbnailable ) {
			const hash = thumbHash( childRel, mtime );
			if ( thumbStatus( args.projectPath, hash ) === 'ready' ) {
				candidates.push( {
					mtime,
					thumbPath: thumbPaths( args.projectPath, hash ).pngRel,
				} );
			}
			continue;
		}
		if ( e.name.toLowerCase().endsWith( '.md' ) ) {
			mdCandidates.push( { mtime, absPath: childAbs, name: e.name } );
		}
	}

	candidates.sort( ( a, b ) => b.mtime - a.mtime );
	const childThumbPaths = candidates
		.slice( 0, MAX_THUMB_TILES )
		.map( ( c ) => c.thumbPath );

	// Only parse markdown for the text-tile fallback when no thumb tiles
	// are available — a folder of mixed PDF + .md still gets the visual
	// stack, and we avoid the parse cost on those.
	const childTextTiles: FolderTextTile[] = [];
	if ( childThumbPaths.length === 0 && mdCandidates.length > 0 ) {
		mdCandidates.sort( ( a, b ) => b.mtime - a.mtime );
		for ( const md of mdCandidates.slice( 0, MAX_THUMB_TILES ) ) {
			try {
				const raw = fs.readFileSync( md.absPath, 'utf-8' );
				const parsed = parseDraft( raw, md.name );
				childTextTiles.push( {
					title: parsed.title,
					excerpt: parsed.description || undefined,
				} );
			} catch {
				// One unreadable file shouldn't blank the stack.
			}
		}
	}

	return {
		entryCount: visible.length,
		latestChildMtime: latestMtime,
		childThumbPaths,
		childTextTiles,
	};
}
