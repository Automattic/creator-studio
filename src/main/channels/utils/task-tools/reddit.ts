import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { httpGet, errMessage } from './http';
import { toolText, toolError } from './result';

// Reddit subreddit / username segments are alphanumerics + underscore. Strip
// everything else so a tool argument can't escape the URL path.
function safeSegment( raw: string ): string {
	return raw.replace( /[^a-zA-Z0-9_]/g, '' );
}

// A Reddit listing carries ~150 fields per post (awards, media metadata,
// HTML-encoded variants, flair richtext, …). Returning it raw blows past the
// MCP result cap; these are the only fields the agent actually reads.
const SELFTEXT_MAX_CHARS = 600;

// Reddit's own JSON cap. Far above a 25-post listing's real size (~130k chars),
// so the body arrives intact for parsing; if it ever doesn't, JSON.parse fails
// loudly and the handler reports it.
const REDDIT_BODY_MAX_CHARS = 1_000_000;

type RedditPost = {
	title: string;
	author: string;
	subreddit: string;
	score: number;
	num_comments: number;
	created: string;
	permalink: string;
	url?: string;
	flair?: string;
	nsfw?: true;
	selftext?: string;
};

function asString( value: unknown ): string {
	return typeof value === 'string' ? value : '';
}

function asNumber( value: unknown ): number {
	return typeof value === 'number' && Number.isFinite( value ) ? value : 0;
}

function slimPost( data: Record< string, unknown > ): RedditPost {
	const permalink = asString( data.permalink );
	const createdUtc = asNumber( data.created_utc );
	const selftext = asString( data.selftext ).trim();
	const flair = asString( data.link_flair_text ).trim();
	const post: RedditPost = {
		title: asString( data.title ),
		author: asString( data.author ),
		subreddit: asString( data.subreddit ),
		score: asNumber( data.score ),
		num_comments: asNumber( data.num_comments ),
		created:
			createdUtc > 0 ? new Date( createdUtc * 1000 ).toISOString() : '',
		permalink: permalink ? `https://www.reddit.com${ permalink }` : '',
	};
	if ( data.is_self !== true && asString( data.url ) ) {
		post.url = asString( data.url );
	}
	if ( flair ) {
		post.flair = flair;
	}
	if ( data.over_18 === true ) {
		post.nsfw = true;
	}
	if ( selftext ) {
		post.selftext =
			selftext.length > SELFTEXT_MAX_CHARS
				? `${ selftext.slice(
						0,
						SELFTEXT_MAX_CHARS
				  ) }… [truncated — fetch the permalink for the full post]`
				: selftext;
	}
	return post;
}

// Parses a Reddit listing response and keeps only the fields the agent needs.
// Throws if the body isn't valid JSON — the caller turns that into a tool error.
export function slimRedditListing( rawJson: string ): {
	posts: RedditPost[];
	after: string | null;
} {
	const parsed = JSON.parse( rawJson ) as unknown;
	const data =
		parsed && typeof parsed === 'object'
			? ( parsed as { data?: unknown } ).data
			: undefined;
	const listing =
		data && typeof data === 'object'
			? ( data as { children?: unknown; after?: unknown } )
			: undefined;
	const posts: RedditPost[] = [];
	if ( listing && Array.isArray( listing.children ) ) {
		for ( const child of listing.children ) {
			if (
				child &&
				typeof child === 'object' &&
				( child as { kind?: unknown } ).kind === 't3'
			) {
				const childData = ( child as { data?: unknown } ).data;
				if ( childData && typeof childData === 'object' ) {
					posts.push(
						slimPost( childData as Record< string, unknown > )
					);
				}
			}
		}
	}
	return {
		posts,
		after: listing ? asString( listing.after ) || null : null,
	};
}

async function fetchRedditListing(
	url: string,
	failurePrefix: string
): Promise< ReturnType< typeof toolText > > {
	try {
		const res = await httpGet( url, {
			accept: 'application/json',
			maxChars: REDDIT_BODY_MAX_CHARS,
		} );
		if ( ! res.ok ) {
			return toolError(
				`${ failurePrefix } (HTTP ${ res.status }). Reddit may be ` +
					`rate-limiting; try again later.`
			);
		}
		if ( res.truncated ) {
			return toolError(
				'Reddit returned an unexpectedly large response. Try a ' +
					'smaller `limit`.'
			);
		}
		const slim = slimRedditListing( res.body );
		if ( slim.posts.length === 0 ) {
			return toolText( 'No posts found.' );
		}
		return toolText( JSON.stringify( slim, null, 2 ) );
	} catch ( err ) {
		if ( err instanceof SyntaxError ) {
			return toolError(
				'Reddit returned a response that could not be parsed as JSON.'
			);
		}
		return toolError( `${ failurePrefix }: ${ errMessage( err ) }.` );
	}
}

export const redditSearchTool = tool(
	'reddit_search',
	'Search Reddit posts. Returns a JSON object { posts, after }; each post ' +
		'has title, author, subreddit, score, num_comments, created, ' +
		'permalink, and (when present) url, flair and a truncated selftext.',
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
		return fetchRedditListing( url, 'Reddit search failed' );
	}
);

export const redditSubredditTool = tool(
	'reddit_subreddit',
	'List posts from a subreddit. Returns a JSON object { posts, after }; ' +
		'each post has title, author, subreddit, score, num_comments, ' +
		'created, permalink, and (when present) url, flair and a truncated ' +
		'selftext.',
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
		return fetchRedditListing(
			url,
			`Reddit request failed for r/${ sub }`
		);
	}
);
