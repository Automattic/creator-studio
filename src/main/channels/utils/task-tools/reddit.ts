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

// Reddit's own JSON cap. Far above a 100-post listing's real size, so the body
// arrives intact for parsing; if it ever doesn't, JSON.parse fails loudly and
// the handler reports it.
const REDDIT_BODY_MAX_CHARS = 1_000_000;

// --- Window mode (`days`) --------------------------------------------------
// Window mode runs ONE request against Reddit's `top` listing with a `t` time
// filter — no page walking — so a 30-day digest is a single small response.
const REDDIT_PAGE_LIMIT = 100; // Reddit's real per-request max.
const MAX_DAYS = 90; // Upper bound for the `days` param.
const WINDOW_SELFTEXT_MAX = 200; // Shorter selftext cap in window mode.
// The envelope is measured in characters, but the MCP host caps a tool result
// at ~25k *tokens* — and dense JSON (URLs, timestamps, escaped text) runs only
// ~2 chars/token. 36k chars of minified JSON lands near ~18k tokens, well
// under the cap, so the result is always delivered inline (never spilled to a
// file the model has to shell out to read).
const WINDOW_JSON_MAX_CHARS = 36_000;

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

function slimPost(
	data: Record< string, unknown >,
	selftextMax: number = SELFTEXT_MAX_CHARS
): RedditPost {
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
			selftext.length > selftextMax
				? `${ selftext.slice(
						0,
						selftextMax
				  ) }… [truncated — fetch the permalink for the full post]`
				: selftext;
	}
	return post;
}

// Parses a Reddit listing response and keeps only the fields the agent needs.
// Throws if the body isn't valid JSON — the caller turns that into a tool error.
export function slimRedditListing(
	rawJson: string,
	selftextMax: number = SELFTEXT_MAX_CHARS
): {
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
						slimPost(
							childData as Record< string, unknown >,
							selftextMax
						)
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

// --- Window mode (`days`) --------------------------------------------------

// Epoch ms of the oldest post still inside an N-day window. `now` is injected
// so the date filter is deterministic under test.
export function cutoffMs( days: number, now: number ): number {
	return now - days * 24 * 60 * 60 * 1000;
}

// Smallest Reddit `t` bucket that fully covers an N-day window. Reddit's `top`
// listing only offers coarse buckets, so the exact cutoff filter trims the
// remainder afterwards.
function timeBucket( days: number ): string {
	if ( days <= 1 ) {
		return 'day';
	}
	if ( days <= 7 ) {
		return 'week';
	}
	if ( days <= 31 ) {
		return 'month';
	}
	return 'year';
}

// Drops posts older than the N-day cutoff. A post with no usable timestamp is
// kept — never silently discarded over a missing field.
export function filterToWindow(
	posts: RedditPost[],
	days: number,
	now: number
): RedditPost[] {
	const cutoff = cutoffMs( days, now );
	return posts.filter( ( post ) => {
		if ( ! post.created ) {
			return true;
		}
		const ts = Date.parse( post.created );
		return Number.isNaN( ts ) || ts >= cutoff;
	} );
}

type WindowEnvelope = {
	window_days: number;
	time_filter: string;
	ranked_by: 'score';
	count: number;
	serialized: number;
	newest: string | null;
	oldest: string | null;
	complete: boolean;
	note: string;
	posts: RedditPost[];
};

function windowNote(
	days: number,
	count: number,
	serialized: number,
	cappedByApi: boolean
): string {
	if ( count === 0 ) {
		return `No posts found in the last ${ days } days.`;
	}
	if ( cappedByApi ) {
		return (
			`Showing the top ${ serialized } posts by score for the last ` +
			`${ days } days. The Reddit "top" listing is capped at ` +
			`${ REDDIT_PAGE_LIMIT } posts, so a busy subreddit had more — ` +
			'these are the most popular.'
		);
	}
	if ( serialized < count ) {
		return (
			`Returned the top ${ serialized } of ${ count } posts by score; ` +
			'the lowest-scored were trimmed to keep the response inline.'
		);
	}
	return `All ${ count } posts from the last ${ days } days, ranked by score.`;
}

function assembleEnvelope(
	ranked: RedditPost[],
	count: number,
	take: number,
	days: number,
	bucket: string,
	cappedByApi: boolean
): WindowEnvelope {
	const posts = ranked.slice( 0, take );
	const serialized = posts.length;
	const dates = posts
		.map( ( p ) => p.created )
		.filter( Boolean )
		.sort();
	const newest = dates.length > 0 ? dates[ dates.length - 1 ] : null;
	const oldest = dates.length > 0 ? dates[ 0 ] : null;
	return {
		window_days: days,
		time_filter: bucket,
		ranked_by: 'score',
		count,
		serialized,
		newest,
		oldest,
		complete: ! cappedByApi && serialized === count,
		note: windowNote( days, count, serialized, cappedByApi ),
		posts,
	};
}

// Ranks the windowed posts by score and trims the serialized slice until the
// minified JSON fits under the token-safe cap. `count` always reports the true
// in-window total; the lowest-scored posts are dropped first.
export function buildWindowEnvelope(
	windowPosts: RedditPost[],
	meta: { days: number; timeFilter: string; cappedByApi: boolean }
): WindowEnvelope {
	const ranked = [ ...windowPosts ].sort( ( a, b ) => b.score - a.score );
	const count = ranked.length;
	let take = count;
	let envelope = assembleEnvelope(
		ranked,
		count,
		take,
		meta.days,
		meta.timeFilter,
		meta.cappedByApi
	);
	while (
		take > 0 &&
		JSON.stringify( envelope ).length > WINDOW_JSON_MAX_CHARS
	) {
		take = Math.max( 0, take - 5 );
		envelope = assembleEnvelope(
			ranked,
			count,
			take,
			meta.days,
			meta.timeFilter,
			meta.cappedByApi
		);
	}
	return envelope;
}

async function fetchWindow(
	url: string,
	opts: { days: number; timeFilter: string; failurePrefix: string }
): Promise< ReturnType< typeof toolText > > {
	try {
		const res = await httpGet( url, {
			accept: 'application/json',
			maxChars: REDDIT_BODY_MAX_CHARS,
		} );
		if ( ! res.ok ) {
			return toolError(
				`${ opts.failurePrefix } (HTTP ${ res.status }). Reddit may ` +
					'be rate-limiting; try again later.'
			);
		}
		if ( res.truncated ) {
			return toolError(
				'Reddit returned an unexpectedly large response.'
			);
		}
		const { posts } = slimRedditListing( res.body, WINDOW_SELFTEXT_MAX );
		const cappedByApi = posts.length >= REDDIT_PAGE_LIMIT;
		const windowPosts = filterToWindow( posts, opts.days, Date.now() );
		const envelope = buildWindowEnvelope( windowPosts, {
			days: opts.days,
			timeFilter: opts.timeFilter,
			cappedByApi,
		} );
		return toolText( JSON.stringify( envelope ) );
	} catch ( err ) {
		if ( err instanceof SyntaxError ) {
			return toolError(
				'Reddit returned a response that could not be parsed as JSON.'
			);
		}
		return toolError( `${ opts.failurePrefix }: ${ errMessage( err ) }.` );
	}
}

const SEARCH_DAYS_DOC =
	'Restrict to the last N days (1-90): fetches the top matching posts for ' +
	'that period in a single request and returns a window envelope ' +
	'{ window_days, time_filter, ranked_by, count, serialized, newest, ' +
	'oldest, complete, note, posts } instead of { posts, after }. Posts are ' +
	'ranked by score, most popular first. `sort` and `limit` are ignored.';

const SUBREDDIT_DAYS_DOC =
	'Summarize the last N days (1-90): fetches the top posts of the ' +
	'subreddit for that period in a single request and returns a window ' +
	'envelope { window_days, time_filter, ranked_by, count, serialized, ' +
	'newest, oldest, complete, note, posts } instead of { posts, after }. ' +
	'Posts are ranked by score, most popular first. `sort` and `limit` are ' +
	'ignored. Ideal for a 30-day activity digest — check `note` and ' +
	'`complete` for coverage.';

export const redditSearchTool = tool(
	'reddit_search',
	'Search Reddit posts. Returns { posts, after } for a single page, or — ' +
		'when `days` is set — a window envelope with the top posts of the ' +
		'last N days. Each post has title, author, subreddit, score, ' +
		'num_comments, created, permalink, and (when present) url, flair and ' +
		'a truncated selftext.',
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
		days: z
			.number()
			.int()
			.min( 1 )
			.max( MAX_DAYS )
			.optional()
			.describe( SEARCH_DAYS_DOC ),
	},
	async ( args ) => {
		if ( args.days !== undefined ) {
			const bucket = timeBucket( args.days );
			const params = new URLSearchParams( {
				q: args.query,
				sort: 'top',
				t: bucket,
				limit: String( REDDIT_PAGE_LIMIT ),
				raw_json: '1',
			} );
			let windowUrl: string;
			if ( args.subreddit ) {
				const sub = safeSegment( args.subreddit );
				params.set( 'restrict_sr', '1' );
				windowUrl = `https://www.reddit.com/r/${ sub }/search.json?${ params.toString() }`;
			} else {
				windowUrl = `https://www.reddit.com/search.json?${ params.toString() }`;
			}
			return fetchWindow( windowUrl, {
				days: args.days,
				timeFilter: bucket,
				failurePrefix: 'Reddit search failed',
			} );
		}
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
	'List posts from a subreddit. Returns { posts, after } for a single ' +
		'page, or — when `days` is set — a window envelope with the top ' +
		'posts of the last N days. Each post has title, author, subreddit, ' +
		'score, num_comments, created, permalink, and (when present) url, ' +
		'flair and a truncated selftext.',
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
		days: z
			.number()
			.int()
			.min( 1 )
			.max( MAX_DAYS )
			.optional()
			.describe( SUBREDDIT_DAYS_DOC ),
	},
	async ( args ) => {
		const sub = safeSegment( args.subreddit );
		if ( args.days !== undefined ) {
			const bucket = timeBucket( args.days );
			const params = new URLSearchParams( {
				t: bucket,
				limit: String( REDDIT_PAGE_LIMIT ),
				raw_json: '1',
			} );
			const windowUrl = `https://www.reddit.com/r/${ sub }/top.json?${ params.toString() }`;
			return fetchWindow( windowUrl, {
				days: args.days,
				timeFilter: bucket,
				failurePrefix: `Reddit request failed for r/${ sub }`,
			} );
		}
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
