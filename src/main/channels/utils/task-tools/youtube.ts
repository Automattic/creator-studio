import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { errMessage, httpGet } from './http';
import { toolError, toolText } from './result';

// The YouTube watch page is large; the data blob sits early but give plenty
// of headroom. The returned transcript is capped separately.
const PAGE_MAX_CHARS = 3_000_000;
const TRANSCRIPT_MAX_CHARS = 60_000;

// Pulls the first balanced-brace JSON object that follows `marker`. More
// robust than a non-greedy regex, which breaks on nested `};` inside the JSON.
function jsonObjectAfter( html: string, marker: string ): string | null {
	const markerIdx = html.indexOf( marker );
	if ( markerIdx < 0 ) {
		return null;
	}
	const start = html.indexOf( '{', markerIdx );
	if ( start < 0 ) {
		return null;
	}
	let depth = 0;
	let inString = false;
	let escaped = false;
	for ( let i = start; i < html.length; i++ ) {
		const ch = html[ i ];
		if ( inString ) {
			if ( escaped ) {
				escaped = false;
			} else if ( ch === '\\' ) {
				escaped = true;
			} else if ( ch === '"' ) {
				inString = false;
			}
			continue;
		}
		if ( ch === '"' ) {
			inString = true;
		} else if ( ch === '{' ) {
			depth += 1;
		} else if ( ch === '}' ) {
			depth -= 1;
			if ( depth === 0 ) {
				return html.slice( start, i + 1 );
			}
		}
	}
	return null;
}

type CaptionTrack = {
	baseUrl?: string;
	languageCode?: string;
	kind?: string;
};

function decodeEntities( raw: string ): string {
	return raw
		.replace( /&amp;/g, '&' )
		.replace( /&lt;/g, '<' )
		.replace( /&gt;/g, '>' )
		.replace( /&quot;/g, '"' )
		.replace( /&#3[49];/g, "'" )
		.replace( /&#(\d+);/g, ( _, n ) =>
			String.fromCodePoint( parseInt( n, 10 ) )
		);
}

function tidy( joined: string ): string | null {
	const text = joined.replace( /\s+/g, ' ' ).trim();
	return text.length > 0 ? text : null;
}

// json3 caption format: { events: [ { segs: [ { utf8 } ] } ] }.
async function captionFromJson3( baseUrl: string ): Promise< string | null > {
	try {
		const res = await httpGet( `${ baseUrl }&fmt=json3`, {
			accept: 'application/json',
			maxChars: 2_000_000,
		} );
		if ( ! res.ok || res.body.trim().length === 0 ) {
			return null;
		}
		const data = JSON.parse( res.body ) as {
			events?: Array< { segs?: Array< { utf8?: string } > } >;
		};
		const parts: string[] = [];
		for ( const ev of data.events ?? [] ) {
			for ( const seg of ev.segs ?? [] ) {
				parts.push( seg.utf8 ?? '' );
			}
		}
		return tidy( parts.join( ' ' ) );
	} catch {
		return null;
	}
}

// Plain (XML) caption format: <text start="…">escaped text</text>.
async function captionFromXml( baseUrl: string ): Promise< string | null > {
	try {
		const res = await httpGet( baseUrl, {
			accept: 'text/xml, application/xml',
			maxChars: 2_000_000,
		} );
		if ( ! res.ok ) {
			return null;
		}
		const parts = [
			...res.body.matchAll( /<text[^>]*>([\s\S]*?)<\/text>/g ),
		].map( ( m ) => decodeEntities( m[ 1 ] ) );
		return tidy( parts.join( ' ' ) );
	} catch {
		return null;
	}
}

// Tries every caption track (manual English first, then auto, then any) and
// both caption formats — YouTube serves an empty body for some tracks, so a
// single attempt is unreliable.
async function fetchTranscript(
	tracks: CaptionTrack[]
): Promise< string | null > {
	if ( ! Array.isArray( tracks ) || tracks.length === 0 ) {
		return null;
	}
	const isEnglish = ( t: CaptionTrack ): boolean =>
		( t.languageCode ?? '' ).startsWith( 'en' );
	const ordered = [
		...tracks.filter( ( t ) => isEnglish( t ) && t.kind !== 'asr' ),
		...tracks.filter( ( t ) => isEnglish( t ) && t.kind === 'asr' ),
		...tracks.filter( ( t ) => ! isEnglish( t ) ),
	];
	for ( const track of ordered ) {
		if ( ! track.baseUrl ) {
			continue;
		}
		const text =
			( await captionFromJson3( track.baseUrl ) ) ??
			( await captionFromXml( track.baseUrl ) );
		if ( text ) {
			return text.length > TRANSCRIPT_MAX_CHARS
				? `${ text.slice(
						0,
						TRANSCRIPT_MAX_CHARS
				  ) }\n\n[Transcript truncated.]`
				: text;
		}
	}
	return null;
}

export const fetchYoutubeTool = tool(
	'fetch_youtube',
	'Fetch a YouTube video as readable text — title, channel, description and ' +
		'(when captions exist) the transcript. Use this for any youtube.com ' +
		'or youtu.be URL. Needs no shell, curl or python.',
	{ url: z.string().describe( 'The YouTube video URL.' ) },
	async ( args ) => {
		try {
			const page = await httpGet( args.url, {
				accept: 'text/html',
				timeoutMs: 25_000,
				maxChars: PAGE_MAX_CHARS,
			} );
			if ( ! page.ok ) {
				return toolError(
					`YouTube request failed (HTTP ${ page.status }) for ${ args.url }.`
				);
			}
			const blob = jsonObjectAfter(
				page.body,
				'ytInitialPlayerResponse'
			);
			if ( ! blob ) {
				return toolError(
					'Could not locate the video data on the page — YouTube may ' +
						'have changed its markup, or the video is unavailable.'
				);
			}
			let player: {
				videoDetails?: Record< string, unknown >;
				captions?: {
					playerCaptionsTracklistRenderer?: {
						captionTracks?: CaptionTrack[];
					};
				};
			};
			try {
				player = JSON.parse( blob );
			} catch {
				return toolError( 'Could not parse the YouTube video data.' );
			}
			const vd = player.videoDetails ?? {};
			const str = ( key: string ): string => {
				const v = vd[ key ];
				return typeof v === 'string' ? v : '';
			};
			const lines: string[] = [];
			lines.push( `Title: ${ str( 'title' ) }` );
			lines.push( `Channel: ${ str( 'author' ) }` );
			if ( str( 'lengthSeconds' ) ) {
				lines.push( `Length: ${ str( 'lengthSeconds' ) } seconds` );
			}
			if ( str( 'viewCount' ) ) {
				lines.push( `Views: ${ str( 'viewCount' ) }` );
			}
			lines.push( '', 'Description:' );
			lines.push( str( 'shortDescription' ) || '(no description)' );

			const transcript = await fetchTranscript(
				player.captions?.playerCaptionsTracklistRenderer
					?.captionTracks ?? []
			);
			lines.push( '', 'Transcript:' );
			lines.push(
				transcript ??
					'(no transcript available for this video — do not invent one)'
			);
			return toolText( lines.join( '\n' ) );
		} catch ( err ) {
			return toolError(
				`Could not fetch the YouTube video ${ args.url }: ${ errMessage(
					err
				) }.`
			);
		}
	}
);
