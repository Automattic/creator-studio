// Shared YouTube URL helpers. Pure (URL + regex), safe to import from both
// the main process (clipping thumbnail fetcher) and the renderer (resource
// preview's embedded player). Keep this dependency-free so it can live at the
// top of `src/` alongside `types.ts`.

export const YOUTUBE_HOSTS: ReadonlySet< string > = new Set( [
	'youtube.com',
	'www.youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtu.be',
] );

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
