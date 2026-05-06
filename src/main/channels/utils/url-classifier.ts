import type { UrlImportKind } from '../../../types';

export type UrlClassification = {
	kind: UrlImportKind;
	// Always an absolute URL with a scheme. Bare domains like "example.com"
	// (and "youtu.be/abc") are auto-prefixed with `https://` so callers can
	// hand it straight to `WebFetch` / `curl` without further parsing.
	normalizedUrl: string;
	hostname: string;
};

const YOUTUBE_HOSTS: ReadonlySet< string > = new Set( [
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtu.be',
] );

const TWEET_HOSTS: ReadonlySet< string > = new Set( [
	'twitter.com',
	'www.twitter.com',
	'mobile.twitter.com',
	'x.com',
	'www.x.com',
	'mobile.x.com',
] );

// Pure helper: returns null only when the input doesn't parse as a URL after
// the `https://` auto-prefix. Everything else lands on `website` — that's the
// catch-all by design, not a placeholder.
export function classifyUrl( input: string ): UrlClassification | null {
	const trimmed = input.trim();
	if ( trimmed.length === 0 ) {
		return null;
	}
	// Auto-prefix `https://` only when the input has no scheme at all. If a
	// non-http scheme is already present (ftp:, file:, javascript:, …) we
	// must not paste another scheme on top — the protocol check below would
	// then accept the wrong thing because URL parsing is forgiving.
	const hasScheme = /^[a-z][a-z0-9+\-.]*:/i.test( trimmed );
	const withScheme = hasScheme ? trimmed : `https://${ trimmed }`;
	let parsed: URL;
	try {
		parsed = new URL( withScheme );
	} catch {
		return null;
	}
	if ( parsed.protocol !== 'http:' && parsed.protocol !== 'https:' ) {
		return null;
	}
	if ( ! parsed.hostname ) {
		return null;
	}
	const hostname = parsed.hostname.toLowerCase();
	const kind = pickKind( hostname );
	return {
		kind,
		normalizedUrl: parsed.toString(),
		hostname,
	};
}

function pickKind( hostname: string ): UrlImportKind {
	if ( YOUTUBE_HOSTS.has( hostname ) ) {
		return 'youtube';
	}
	if ( TWEET_HOSTS.has( hostname ) ) {
		return 'tweet';
	}
	return 'website';
}
