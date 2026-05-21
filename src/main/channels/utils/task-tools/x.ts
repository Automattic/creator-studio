import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { httpGet, errMessage } from './http';
import { toolText, toolError } from './result';

// X/Twitter has no usable free API and its own pages are JavaScript-heavy, so
// this tool is best-effort: it tries a few nitter-style mirrors that expose
// RSS, then falls back to the x.com profile page. Mirrors come and go — the
// list is expected to rot; the tool degrades loudly rather than failing
// silently.
const MIRRORS = [
	'https://xcancel.com',
	'https://nitter.poast.org',
	'https://lightbrd.com',
];

const BEST_EFFORT_NOTE =
	'BEST-EFFORT SOURCE: X/Twitter has no reliable public feed. The data ' +
	'below came from a third-party mirror and may be incomplete or stale — ' +
	'say so when you use it.\n\n';

function safeHandle( raw: string ): string {
	return raw.replace( /^@+/, '' ).replace( /[^a-zA-Z0-9_]/g, '' );
}

export const xActivityTool = tool(
	'x_activity',
	'Best-effort fetch of recent posts from an X (Twitter) account. X has no ' +
		'reliable public feed, so results may be incomplete or fail entirely ' +
		'— always treat this data as unverified.',
	{
		handle: z
			.string()
			.describe( 'The X/Twitter account handle (with or without "@").' ),
	},
	async ( args ) => {
		const handle = safeHandle( args.handle );
		if ( ! handle ) {
			return toolError( 'x_activity needs a valid account handle.' );
		}
		const attempts: string[] = [];

		for ( const mirror of MIRRORS ) {
			const url = `${ mirror }/${ handle }/rss`;
			try {
				const res = await httpGet( url, {
					accept: 'application/rss+xml, application/xml, */*',
				} );
				if ( res.ok && res.body.includes( '<item' ) ) {
					return toolText(
						`${ BEST_EFFORT_NOTE }Source: ${ mirror } (RSS mirror)\n\n${ res.body }`
					);
				}
				attempts.push( `${ mirror }: HTTP ${ res.status }` );
			} catch ( err ) {
				attempts.push( `${ mirror }: ${ errMessage( err ) }` );
			}
		}

		// Last resort: the live profile page. Often JS-rendered and sparse,
		// but occasionally returns server-rendered post text.
		try {
			const res = await httpGet( `https://x.com/${ handle }`, {
				accept: 'text/html,application/xhtml+xml',
			} );
			if ( res.ok ) {
				return toolText(
					`${ BEST_EFFORT_NOTE }Source: x.com profile page (raw HTML — ` +
						`may contain little usable text)\n\n${ res.body }`
				);
			}
			attempts.push( `x.com: HTTP ${ res.status }` );
		} catch ( err ) {
			attempts.push( `x.com: ${ errMessage( err ) }` );
		}

		return toolError(
			`Could not retrieve activity for @${ handle }. All sources failed:\n` +
				attempts.map( ( a ) => `- ${ a }` ).join( '\n' )
		);
	}
);
