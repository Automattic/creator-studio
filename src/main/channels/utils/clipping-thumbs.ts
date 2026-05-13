import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

import { THUMBS_DIR_REL } from './thumbnails';

// How much of a markdown file we'll peek at to look for a clipping URL.
// Stays small so the synchronous read in the list endpoint doesn't stall on
// a long note that happens to be a clipping with the URL in line 3.
const URL_PROBE_BYTES = 4096;

// Network timeout for a single fetch (head + body). YouTube CDN is usually
// well under a second; og:image scrape can dawdle, so 5s is a balance.
const FETCH_TIMEOUT_MS = 5000;

// Cap on how much HTML we'll read while scraping og:image. The tag almost
// always lives in <head>, well within the first 64KB; reading further just
// burns memory on long article pages.
const HTML_SCRAPE_BYTES = 64 * 1024;

const YOUTUBE_HOSTS: ReadonlySet< string > = new Set( [
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtu.be',
] );

const FRONTMATTER_URL_KEYS = [ 'source', 'url', 'link' ];

export type ClippingKind = 'youtube' | 'web';

export type ClippingInfo = {
	url: string;
	host: string;
	kind: ClippingKind;
	hash: string;
};

// Sync URL detection: frontmatter first, then the first http(s) URL in the
// (lightly probed) body. Returns null when nothing usable was found — the
// caller treats that as "this .md isn't a clipping".
export function extractClippingInfo( filePath: string ): ClippingInfo | null {
	if ( ! filePath.toLowerCase().endsWith( '.md' ) ) {
		return null;
	}
	let raw: string;
	try {
		const fd = fs.openSync( filePath, 'r' );
		try {
			const buf = Buffer.alloc( URL_PROBE_BYTES );
			const read = fs.readSync( fd, buf, 0, URL_PROBE_BYTES, 0 );
			raw = buf.subarray( 0, read ).toString( 'utf-8' );
		} finally {
			fs.closeSync( fd );
		}
	} catch {
		return null;
	}
	const url = pickUrlFromMarkdown( raw );
	if ( ! url ) {
		return null;
	}
	let parsed: URL;
	try {
		parsed = new URL( url );
	} catch {
		return null;
	}
	if ( parsed.protocol !== 'http:' && parsed.protocol !== 'https:' ) {
		return null;
	}
	const host = parsed.hostname.toLowerCase();
	const kind: ClippingKind = YOUTUBE_HOSTS.has( host ) ? 'youtube' : 'web';
	return {
		url: parsed.toString(),
		host,
		kind,
		hash: clippingHash( parsed.toString() ),
	};
}

function pickUrlFromMarkdown( raw: string ): string | null {
	try {
		const fm = matter( raw );
		const data = fm.data as Record< string, unknown >;
		for ( const key of FRONTMATTER_URL_KEYS ) {
			const value = data[ key ];
			if ( typeof value === 'string' && value.trim().length > 0 ) {
				return value.trim();
			}
		}
	} catch {
		// gray-matter throws on malformed frontmatter; fall through to body scan
	}
	const match = raw.match( /https?:\/\/[^\s)<>"']+/ );
	return match ? match[ 0 ] : null;
}

export function clippingHash( url: string ): string {
	return crypto
		.createHash( 'sha1' )
		.update( url )
		.digest( 'hex' )
		.slice( 0, 16 );
}

export type ClippingCachePaths = {
	dir: string;
	failedAbs: string;
	// Multiple candidate extensions are checked when reading; writers pick
	// one based on the response's Content-Type.
	candidates: { ext: string; abs: string; rel: string }[];
};

export function clippingPaths(
	projectPath: string,
	hash: string
): ClippingCachePaths {
	const dir = path.join( projectPath, THUMBS_DIR_REL );
	const base = `clip-${ hash }`;
	const exts = [ '.jpg', '.png', '.webp' ];
	return {
		dir,
		failedAbs: path.join( dir, `${ base }.err` ),
		candidates: exts.map( ( ext ) => ( {
			ext,
			abs: path.join( dir, `${ base }${ ext }` ),
			rel: `${ THUMBS_DIR_REL }/${ base }${ ext }`,
		} ) ),
	};
}

export type ClippingThumbStatus =
	| { kind: 'ready'; rel: string }
	| { kind: 'failed' }
	| { kind: 'missing' };

export function clippingThumbStatus(
	projectPath: string,
	hash: string
): ClippingThumbStatus {
	const paths = clippingPaths( projectPath, hash );
	for ( const candidate of paths.candidates ) {
		if ( fs.existsSync( candidate.abs ) ) {
			return { kind: 'ready', rel: candidate.rel };
		}
	}
	if ( fs.existsSync( paths.failedAbs ) ) {
		return { kind: 'failed' };
	}
	return { kind: 'missing' };
}

// In-flight guard: if listFiles fires twice in quick succession before the
// first fetch lands, we don't want to hit the same URL twice. Keyed by
// `<projectPath>::<hash>` so two projects fetching the same URL still each
// get their own cache entry.
const inflight = new Set< string >();

// Background fetcher. Returns true when a thumbnail was written to disk so
// the caller can ping the renderer to refresh; false when nothing landed
// (sentinel written, or call de-duped against an in-flight fetch). On
// failure a `.err` sentinel is dropped so we don't re-hammer the network
// on every list refresh — delete `clip-<hash>.err` to retry.
export async function fetchClippingThumb(
	projectPath: string,
	info: ClippingInfo
): Promise< boolean > {
	const key = `${ projectPath }::${ info.hash }`;
	if ( inflight.has( key ) ) {
		return false;
	}
	inflight.add( key );
	try {
		return await fetchClippingThumbImpl( projectPath, info );
	} finally {
		inflight.delete( key );
	}
}

async function fetchClippingThumbImpl(
	projectPath: string,
	info: ClippingInfo
): Promise< boolean > {
	const paths = clippingPaths( projectPath, info.hash );
	try {
		fs.mkdirSync( paths.dir, { recursive: true } );
	} catch {
		return false;
	}
	const candidates = await thumbnailCandidatesFor( info );
	for ( const candidate of candidates ) {
		const result = await downloadImage( candidate );
		if ( ! result ) {
			continue;
		}
		const ext = pickExtension( candidate, result.contentType );
		const targetPath = path.join(
			paths.dir,
			`clip-${ info.hash }${ ext }`
		);
		try {
			fs.writeFileSync( targetPath, result.body );
			return true;
		} catch {
			// Disk failed — fall through and try the sentinel
			break;
		}
	}
	try {
		fs.writeFileSync(
			paths.failedAbs,
			JSON.stringify( { url: info.url, at: Date.now() } )
		);
	} catch {
		// best effort
	}
	return false;
}

// Per-host strategy for which image URLs to try. YouTube exposes a deterministic
// thumbnail URL keyed by video id; everything else needs an og:image scrape.
async function thumbnailCandidatesFor(
	info: ClippingInfo
): Promise< string[] > {
	if ( info.kind === 'youtube' ) {
		const videoId = extractYouTubeVideoId( info.url );
		if ( videoId ) {
			return [
				`https://i.ytimg.com/vi/${ videoId }/maxresdefault.jpg`,
				`https://i.ytimg.com/vi/${ videoId }/hqdefault.jpg`,
			];
		}
		return [];
	}
	const og = await scrapeOgImage( info.url );
	return og ? [ og ] : [];
}

export function extractYouTubeVideoId( url: string ): string | null {
	try {
		const parsed = new URL( url );
		const host = parsed.hostname.toLowerCase();
		if ( host === 'youtu.be' ) {
			const id = parsed.pathname.replace( /^\//, '' ).split( '/' )[ 0 ];
			return id && /^[\w-]{6,}$/.test( id ) ? id : null;
		}
		if ( YOUTUBE_HOSTS.has( host ) ) {
			const v = parsed.searchParams.get( 'v' );
			if ( v && /^[\w-]{6,}$/.test( v ) ) {
				return v;
			}
			const shorts = parsed.pathname.match( /^\/shorts\/([\w-]{6,})/ );
			if ( shorts ) {
				return shorts[ 1 ];
			}
		}
	} catch {
		return null;
	}
	return null;
}

type DownloadResult = { body: Buffer; contentType: string | null };

async function downloadImage( url: string ): Promise< DownloadResult | null > {
	try {
		const res = await fetch( url, {
			signal: AbortSignal.timeout( FETCH_TIMEOUT_MS ),
			headers: { 'User-Agent': 'studio-write/0.1' },
		} );
		if ( ! res.ok ) {
			return null;
		}
		const buf = Buffer.from( await res.arrayBuffer() );
		return { body: buf, contentType: res.headers.get( 'content-type' ) };
	} catch {
		return null;
	}
}

function pickExtension( url: string, contentType: string | null ): string {
	if ( contentType ) {
		if ( contentType.includes( 'png' ) ) {
			return '.png';
		}
		if ( contentType.includes( 'webp' ) ) {
			return '.webp';
		}
		if ( contentType.includes( 'jpeg' ) || contentType.includes( 'jpg' ) ) {
			return '.jpg';
		}
	}
	const fromUrl = url.toLowerCase().match( /\.(png|webp|jpg|jpeg)(?:\?|$)/ );
	if ( fromUrl ) {
		return fromUrl[ 1 ] === 'jpeg' ? '.jpg' : `.${ fromUrl[ 1 ] }`;
	}
	return '.jpg';
}

// Best-effort og:image scrape for non-YouTube clippings. Exported so the
// fetch path can grow per-host strategies without changing the call site.
export async function scrapeOgImage(
	pageUrl: string
): Promise< string | null > {
	try {
		const res = await fetch( pageUrl, {
			signal: AbortSignal.timeout( FETCH_TIMEOUT_MS ),
			headers: { 'User-Agent': 'studio-write/0.1' },
		} );
		if ( ! res.ok || ! res.body ) {
			return null;
		}
		const reader = res.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		while ( total < HTML_SCRAPE_BYTES ) {
			const { value, done } = await reader.read();
			if ( done ) {
				break;
			}
			chunks.push( value );
			total += value.byteLength;
		}
		try {
			await reader.cancel();
		} catch {
			// stream may already be closed
		}
		const html = Buffer.concat( chunks ).toString( 'utf-8' );
		const match = html.match(
			/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
		);
		if ( match ) {
			return resolveAgainst( pageUrl, match[ 1 ] );
		}
		const alt = html.match(
			/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
		);
		return alt ? resolveAgainst( pageUrl, alt[ 1 ] ) : null;
	} catch {
		return null;
	}
}

function resolveAgainst( base: string, ref: string ): string | null {
	try {
		return new URL( ref, base ).toString();
	} catch {
		return null;
	}
}
