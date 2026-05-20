import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { httpGet, errMessage } from './http';
import { toolText, toolError } from './result';

// Reddit subreddit / username segments are alphanumerics + underscore. Strip
// everything else so a tool argument can't escape the URL path.
function safeSegment( raw: string ): string {
	return raw.replace( /[^a-zA-Z0-9_]/g, '' );
}

export const redditSearchTool = tool(
	'reddit_search',
	'Search Reddit posts. Returns the raw JSON response from Reddit; read ' +
		'the `data.children[].data` entries (title, selftext, permalink, ' +
		'score, num_comments, created_utc) yourself.',
	{
		query: z.string().describe( 'Search terms.' ),
		subreddit: z
			.string()
			.optional()
			.describe( 'Restrict the search to this subreddit (no "r/").' ),
		sort: z
			.enum( [ 'relevance', 'hot', 'top', 'new', 'comments' ] )
			.optional()
			.describe( 'Result ordering. Defaults to relevance.' ),
		limit: z
			.number()
			.int()
			.min( 1 )
			.max( 25 )
			.optional()
			.describe( 'Maximum posts to return (1-25). Defaults to 10.' ),
	},
	async ( args ) => {
		const params = new URLSearchParams( {
			q: args.query,
			sort: args.sort ?? 'relevance',
			limit: String( args.limit ?? 10 ),
			raw_json: '1',
		} );
		let url: string;
		if ( args.subreddit ) {
			const sub = safeSegment( args.subreddit );
			params.set( 'restrict_sr', '1' );
			url = `https://www.reddit.com/r/${ sub }/search.json?${ params.toString() }`;
		} else {
			url = `https://www.reddit.com/search.json?${ params.toString() }`;
		}
		try {
			const res = await httpGet( url, { accept: 'application/json' } );
			if ( ! res.ok ) {
				return toolError(
					`Reddit search failed (HTTP ${ res.status }). Reddit may be ` +
						`rate-limiting; try again later.`
				);
			}
			return toolText( res.body );
		} catch ( err ) {
			return toolError( `Reddit search failed: ${ errMessage( err ) }.` );
		}
	}
);

export const redditSubredditTool = tool(
	'reddit_subreddit',
	"List posts from a subreddit. Returns Reddit's raw JSON; read the " +
		'`data.children[].data` entries yourself.',
	{
		subreddit: z.string().describe( 'The subreddit name (no "r/").' ),
		sort: z
			.enum( [ 'hot', 'new', 'top', 'rising' ] )
			.optional()
			.describe( 'Listing to fetch. Defaults to hot.' ),
		limit: z
			.number()
			.int()
			.min( 1 )
			.max( 25 )
			.optional()
			.describe( 'Maximum posts to return (1-25). Defaults to 10.' ),
	},
	async ( args ) => {
		const sub = safeSegment( args.subreddit );
		const sort = args.sort ?? 'hot';
		const params = new URLSearchParams( {
			limit: String( args.limit ?? 10 ),
			raw_json: '1',
		} );
		const url = `https://www.reddit.com/r/${ sub }/${ sort }.json?${ params.toString() }`;
		try {
			const res = await httpGet( url, { accept: 'application/json' } );
			if ( ! res.ok ) {
				return toolError(
					`Reddit request failed (HTTP ${ res.status }) for r/${ sub }. ` +
						`Reddit may be rate-limiting; try again later.`
				);
			}
			return toolText( res.body );
		} catch ( err ) {
			return toolError(
				`Reddit request failed: ${ errMessage( err ) }.`
			);
		}
	}
);
