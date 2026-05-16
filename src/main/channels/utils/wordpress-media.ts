import fs from 'node:fs';
import path from 'node:path';

import { buildAuthHeader } from './wordpress-client';
import type { WordpressConnection } from '../../../types';

// Reverse of MIME_TO_EXT in draft-asset-store.ts. svg falls through to
// `application/octet-stream` rather than `image/svg+xml` because WP
// refuses SVG uploads from non-admin users by default; the safer
// thing is to keep them out of the media library entirely (the publish
// pipeline filters them upstream).
const EXT_TO_MIME: Record< string, string > = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
};

export type UploadedMedia = { id: number; sourceUrl: string };

export type MediaUploadError =
	| 'unsupported-type'
	| 'file-too-large'
	| 'read-failed'
	| 'network'
	| 'unauthorized'
	| 'forbidden'
	| 'http-error';

export type MediaUploadResult =
	| { ok: true; data: UploadedMedia }
	| {
			ok: false;
			reason: MediaUploadError;
			status?: number;
			message?: string;
	  };

// WP's hard limit for an REST upload is `upload_max_filesize` /
// `post_max_size` (usually 32–128 MB on default hosts). We pre-cap at
// 32 MB to fail fast with a clear error rather than letting the host
// truncate or 413 us.
const MEDIA_UPLOAD_MAX_BYTES = 32_000_000;

export function mimeForExt( ext: string ): string | null {
	return EXT_TO_MIME[ ext.toLowerCase() ] ?? null;
}

function buildMediaUrl( connection: WordpressConnection ): string {
	if ( connection.kind === 'wpcom-oauth' ) {
		return `https://public-api.wordpress.com/wp/v2/sites/${ connection.wpcomBlogId }/media`;
	}
	return `${ connection.siteUrl }/wp-json/wp/v2/media`;
}

// Uploads a single local file as a media attachment. WP returns the
// canonical attachment record on success; we only keep `id` and
// `source_url`, which is what the post body's `<img src>` ultimately
// needs to point at.
export async function uploadMediaFile(
	connection: WordpressConnection,
	absolutePath: string,
	filename: string
): Promise< MediaUploadResult > {
	const ext = path.extname( filename ).replace( /^\./, '' );
	const mime = mimeForExt( ext );
	if ( ! mime ) {
		return { ok: false, reason: 'unsupported-type' };
	}

	let bytes: Buffer;
	try {
		bytes = fs.readFileSync( absolutePath );
	} catch {
		return { ok: false, reason: 'read-failed' };
	}
	if ( bytes.length === 0 ) {
		return { ok: false, reason: 'read-failed' };
	}
	if ( bytes.length > MEDIA_UPLOAD_MAX_BYTES ) {
		return { ok: false, reason: 'file-too-large' };
	}

	const url = buildMediaUrl( connection );
	let response: Response;
	try {
		response = await fetch( url, {
			method: 'POST',
			headers: {
				Authorization: buildAuthHeader( connection ),
				Accept: 'application/json',
				'Content-Type': mime,
				// WP reads the filename from this header — the
				// attachment slug + URL on disk are derived from it.
				'Content-Disposition': `attachment; filename="${ filename.replace(
					/"/g,
					''
				) }"`,
			},
			body: bytes,
		} );
	} catch ( err ) {
		return {
			ok: false,
			reason: 'network',
			message: err instanceof Error ? err.message : String( err ),
		};
	}

	if ( response.status === 401 ) {
		return { ok: false, reason: 'unauthorized', status: 401 };
	}
	if ( response.status === 403 ) {
		return { ok: false, reason: 'forbidden', status: 403 };
	}
	if ( ! response.ok ) {
		const text = await response.text().catch( () => '' );
		return {
			ok: false,
			reason: 'http-error',
			status: response.status,
			message: text.slice( 0, 240 ),
		};
	}

	const data = ( await response.json().catch( () => null ) ) as {
		id?: number;
		source_url?: string;
	} | null;
	if ( ! data?.id || ! data.source_url ) {
		return {
			ok: false,
			reason: 'http-error',
			status: response.status,
			message: 'media response missing id/source_url',
		};
	}
	return { ok: true, data: { id: data.id, sourceUrl: data.source_url } };
}
