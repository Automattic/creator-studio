import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DRAFTS_FOLDER = 'drafts';
const ASSETS_SUBFOLDER = 'assets';

// Decoded byte cap on a single dropped/picked image. Most pasted screenshots
// are 1–4 MB; 25 MB covers ultra-wide grabs without inviting people to drop
// 100 MB raw photos into a markdown draft.
export const DRAFT_ASSET_MAX_BYTES = 25_000_000;

export const MIME_TO_EXT: Record< string, string > = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/svg+xml': 'svg',
};

export type WriteDraftAssetResult =
	| { ok: true; relPath: string }
	| { ok: false; reason: 'mime' | 'too-large' | 'not-found' | 'io-error' };

// Hashes `buf`, writes it to `<projectPath>/drafts/assets/<hash>.<ext>` if it
// isn't already there, and returns the project-relative `assets/<hash>.<ext>`
// path that goes into the markdown. Shared between `drafts:saveImage` (paste/
// drop, base64 over IPC) and `drafts:pickImage` (native file dialog, fs read).
export function writeDraftAsset(
	projectPath: string,
	buf: Buffer,
	ext: string
): WriteDraftAssetResult {
	if ( buf.length === 0 || buf.length > DRAFT_ASSET_MAX_BYTES ) {
		return { ok: false, reason: 'too-large' };
	}
	const hash = crypto
		.createHash( 'sha256' )
		.update( buf )
		.digest( 'hex' )
		.slice( 0, 12 );
	const filename = `${ hash }.${ ext }`;
	const assetsDir = path.resolve(
		projectPath,
		DRAFTS_FOLDER,
		ASSETS_SUBFOLDER
	);
	const root = path.resolve( projectPath );
	if ( ! assetsDir.startsWith( root + path.sep ) ) {
		// Defensive — paths above are static, but keep the rail explicit.
		return { ok: false, reason: 'not-found' };
	}
	try {
		fs.mkdirSync( assetsDir, { recursive: true } );
		const target = path.join( assetsDir, filename );
		// Content-addressed dedup: skip the write if the same hash is on disk.
		if ( ! fs.existsSync( target ) ) {
			fs.writeFileSync( target, buf );
		}
		return { ok: true, relPath: `${ ASSETS_SUBFOLDER }/${ filename }` };
	} catch {
		return { ok: false, reason: 'io-error' };
	}
}
