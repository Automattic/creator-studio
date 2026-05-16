import fs from 'node:fs';
import path from 'node:path';

import {
	mimeForExt,
	uploadMediaFile,
	type MediaUploadResult,
} from './wordpress-media';
import type { WordpressConnection } from '../../../types';

// Cached upload entry stored in frontmatter under `wp_media`. Keyed by
// the original markdown URL exactly as written in the post body, so
// re-rendering the same body matches the same cache slot.
export type WpMediaCacheEntry = { id: number; source_url: string };
export type WpMediaCache = Record< string, WpMediaCacheEntry >;

// Pulled out so the regex compiles once. Two patterns:
//  - Markdown image:  ![alt](url "optional title")
//  - HTML image tag:  <img ... src="url" ...>
// We deliberately don't try to parse the full markdown AST here — the
// regex pair handles every shape Studio Write's editor produces (and
// the GFM extension doesn't change image syntax).
const MD_IMAGE_REGEX = /!\[([^\]]*)\]\(([^\s)]+)(\s+"[^"]*")?\)/g;
const HTML_IMG_REGEX = /<img\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>/g;

function isRemoteOrData( url: string ): boolean {
	return (
		url.startsWith( 'http://' ) ||
		url.startsWith( 'https://' ) ||
		url.startsWith( '//' ) ||
		url.startsWith( 'data:' )
	);
}

// Resolves a markdown image reference (relative to the .md file's
// folder) to an absolute path inside the project. Returns null when
// the path tries to escape the project root.
export function resolveImagePath(
	projectPath: string,
	folder: 'drafts' | 'done',
	imageUrl: string
): string | null {
	const baseDir = path.resolve( projectPath, folder );
	const candidate = path.resolve( baseDir, imageUrl );
	const projectRoot = path.resolve( projectPath );
	if (
		candidate !== projectRoot &&
		! candidate.startsWith( projectRoot + path.sep )
	) {
		return null;
	}
	// Image references in done/ posts can still point at
	// drafts/assets/ — that's where Studio Write writes assets even
	// after a draft is moved. Fall through to drafts/<rel> when the
	// done-folder resolution doesn't exist.
	if ( fs.existsSync( candidate ) ) {
		return candidate;
	}
	if ( folder === 'done' ) {
		const draftsCandidate = path.resolve( projectPath, 'drafts', imageUrl );
		const root = path.resolve( projectPath );
		if (
			( draftsCandidate === root ||
				draftsCandidate.startsWith( root + path.sep ) ) &&
			fs.existsSync( draftsCandidate )
		) {
			return draftsCandidate;
		}
	}
	return null;
}

export type PerImageError = {
	url: string;
	reason: string;
	status?: number;
	message?: string;
};

export type ProcessImagesResult = {
	body: string;
	cache: WpMediaCache;
	errors: PerImageError[];
};

// Collects every local image URL in the body (deduped), uploads the
// ones missing from `existingCache`, and returns a rewritten body
// where each local URL has been replaced with the WP source_url. The
// cache is the union of `existingCache` plus anything we just
// uploaded — callers store it back in frontmatter so the next publish
// is idempotent.
export async function uploadAndRewriteImages(
	connection: WordpressConnection,
	body: string,
	projectPath: string,
	folder: 'drafts' | 'done',
	existingCache: WpMediaCache
): Promise< ProcessImagesResult > {
	const urls = new Set< string >();
	const collect = ( url: string ): void => {
		if ( isRemoteOrData( url ) ) {
			return;
		}
		urls.add( url );
	};

	body.replace( MD_IMAGE_REGEX, ( _whole, _alt, url ) => {
		collect( url );
		return _whole;
	} );
	body.replace( HTML_IMG_REGEX, ( _whole, _pre, _q, url ) => {
		collect( url );
		return _whole;
	} );

	const cache: WpMediaCache = { ...existingCache };
	const errors: PerImageError[] = [];

	for ( const url of urls ) {
		if ( cache[ url ] ) {
			continue;
		}
		const absolutePath = resolveImagePath( projectPath, folder, url );
		if ( ! absolutePath ) {
			errors.push( { url, reason: 'not-found' } );
			continue;
		}
		const filename = path.basename( absolutePath );
		const ext = path.extname( filename ).replace( /^\./, '' );
		if ( ! mimeForExt( ext ) ) {
			errors.push( { url, reason: 'unsupported-type' } );
			continue;
		}
		const result: MediaUploadResult = await uploadMediaFile(
			connection,
			absolutePath,
			filename
		);
		if ( result.ok === false ) {
			errors.push( {
				url,
				reason: result.reason,
				status: result.status,
				message: result.message,
			} );
			continue;
		}
		cache[ url ] = {
			id: result.data.id,
			source_url: result.data.sourceUrl,
		};
	}

	const rewriteUrl = ( url: string ): string => {
		const hit = cache[ url ];
		return hit ? hit.source_url : url;
	};

	const rewritten = body
		.replace( MD_IMAGE_REGEX, ( _whole, alt, url, title ) => {
			if ( isRemoteOrData( url ) ) {
				return _whole;
			}
			const next = rewriteUrl( url );
			return `![${ alt }](${ next }${ title ?? '' })`;
		} )
		.replace( HTML_IMG_REGEX, ( _whole, pre, quote, url, post ) => {
			if ( isRemoteOrData( url ) ) {
				return _whole;
			}
			const next = rewriteUrl( url );
			return `<img${ pre }src=${ quote }${ next }${ quote }${ post }>`;
		} );

	return { body: rewritten, cache, errors };
}

// Reads the wp_media frontmatter slot and normalises it into a
// WpMediaCache. Tolerates old/garbage shapes so a malformed entry
// doesn't blow up publishing.
export function readMediaCache(
	frontmatter: Record< string, unknown >
): WpMediaCache {
	const raw = frontmatter.wp_media;
	if ( ! raw || typeof raw !== 'object' || Array.isArray( raw ) ) {
		return {};
	}
	const cache: WpMediaCache = {};
	for ( const [ key, value ] of Object.entries(
		raw as Record< string, unknown >
	) ) {
		if (
			value &&
			typeof value === 'object' &&
			! Array.isArray( value ) &&
			typeof ( value as { id?: unknown } ).id === 'number' &&
			typeof ( value as { source_url?: unknown } ).source_url === 'string'
		) {
			cache[ key ] = value as WpMediaCacheEntry;
		}
	}
	return cache;
}
