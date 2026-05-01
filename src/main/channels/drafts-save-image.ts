import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { defineChannel } from './utils/define-channel';
import { getProject } from './utils/project-get';
import { IpcChannels } from '.';

const DRAFTS_FOLDER = 'drafts';
const ASSETS_SUBFOLDER = 'assets';

// Decoded byte cap on a single pasted/dropped image. Most pasted screenshots
// are 1–4 MB; 25 MB covers ultra-wide grabs without inviting people to drop
// 100 MB raw photos into a markdown draft.
const MAX_BYTES = 25_000_000;
// Base64-encoded payloads are ~4/3 the byte length; cap the input string
// loosely above that to fail fast without decoding.
const MAX_B64_LENGTH = Math.ceil( ( MAX_BYTES * 4 ) / 3 ) + 16;

const MIME_TO_EXT: Record< string, string > = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/svg+xml': 'svg',
};

export type DraftSaveImageResult =
	| { ok: true; relPath: string }
	| { ok: false; reason: 'mime' | 'too-large' | 'not-found' | 'io-error' };

export const draftsSaveImage = defineChannel( {
	name: IpcChannels.draftsSaveImage,
	input: z.object( {
		projectId: z.string().min( 1 ),
		mimeType: z.string().min( 1 ),
		dataB64: z.string().max( MAX_B64_LENGTH ),
		originalFilename: z.string().optional(),
	} ),
	handle: ( { projectId, mimeType, dataB64 } ): DraftSaveImageResult => {
		const ext = MIME_TO_EXT[ mimeType.toLowerCase() ];
		if ( ! ext ) {
			return { ok: false, reason: 'mime' };
		}
		const project = getProject( projectId );
		if ( ! project ) {
			return { ok: false, reason: 'not-found' };
		}
		let buf: Buffer;
		try {
			buf = Buffer.from( dataB64, 'base64' );
		} catch {
			return { ok: false, reason: 'io-error' };
		}
		if ( buf.length === 0 || buf.length > MAX_BYTES ) {
			return { ok: false, reason: 'too-large' };
		}
		const hash = crypto
			.createHash( 'sha256' )
			.update( buf )
			.digest( 'hex' )
			.slice( 0, 12 );
		const filename = `${ hash }.${ ext }`;
		const assetsDir = path.resolve(
			project.path,
			DRAFTS_FOLDER,
			ASSETS_SUBFOLDER
		);
		const root = path.resolve( project.path );
		if ( ! assetsDir.startsWith( root + path.sep ) ) {
			// Defensive — paths above are static, but keep the rail explicit.
			return { ok: false, reason: 'not-found' };
		}
		try {
			fs.mkdirSync( assetsDir, { recursive: true } );
			const target = path.join( assetsDir, filename );
			// Content-addressed dedup: if a file with the same hash already
			// exists we skip the write rather than truncating + rewriting.
			if ( ! fs.existsSync( target ) ) {
				fs.writeFileSync( target, buf );
			}
			return {
				ok: true,
				relPath: `${ ASSETS_SUBFOLDER }/${ filename }`,
			};
		} catch {
			return { ok: false, reason: 'io-error' };
		}
	},
} );
