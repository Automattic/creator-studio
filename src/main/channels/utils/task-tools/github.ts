import { z } from 'zod';
import { tool } from '@anthropic-ai/claude-agent-sdk';

import { httpGet, errMessage } from './http';
import { toolText, toolError } from './result';

// GitHub owner / repo / user names: alphanumerics plus - _ . — strip anything
// else so an argument can't escape the API path.
function safeName( raw: string ): string {
	return raw.replace( /[^a-zA-Z0-9_.-]/g, '' );
}

const GH_HEADERS = {
	'X-GitHub-Api-Version': '2022-11-28',
};

// GitHub event payloads (and release notes) can run to several KB each; a
// 30-item page returned raw blows past the MCP result cap. These bound the
// per-item text the agent actually needs.
const COMMIT_MESSAGE_MAX_CHARS = 250;
const RELEASE_BODY_MAX_CHARS = 800;

// Far above a 30-item page's real size, so the body arrives intact for parsing.
const GITHUB_BODY_MAX_CHARS = 2_000_000;

type GithubFeedKind = 'events' | 'commits' | 'releases';

function asString( value: unknown ): string {
	return typeof value === 'string' ? value : '';
}

function asNumber( value: unknown ): number {
	return typeof value === 'number' && Number.isFinite( value ) ? value : 0;
}

function asObject( value: unknown ): Record< string, unknown > {
	return value && typeof value === 'object' && ! Array.isArray( value )
		? ( value as Record< string, unknown > )
		: {};
}

function firstLine( text: string ): string {
	const line = text.split( '\n' )[ 0 ].trim();
	return line.length > COMMIT_MESSAGE_MAX_CHARS
		? `${ line.slice( 0, COMMIT_MESSAGE_MAX_CHARS ) }…`
		: line;
}

function summarizeEvent(
	type: string,
	payload: Record< string, unknown >
): string {
	switch ( type ) {
		case 'PushEvent': {
			const commits = Array.isArray( payload.commits )
				? payload.commits
				: [];
			const msg = firstLine(
				asString( asObject( commits[ 0 ] ).message )
			);
			return (
				`pushed ${ asNumber( payload.size ) } commit(s)` +
				( msg ? `: "${ msg }"` : '' )
			);
		}
		case 'PullRequestEvent':
			return `${ asString( payload.action ) } PR #${ asNumber(
				payload.number
			) }: "${ asString( asObject( payload.pull_request ).title ) }"`;
		case 'IssuesEvent':
			return `${ asString( payload.action ) } issue #${ asNumber(
				asObject( payload.issue ).number
			) }: "${ asString( asObject( payload.issue ).title ) }"`;
		case 'IssueCommentEvent':
			return `commented on #${ asNumber(
				asObject( payload.issue ).number
			) }: "${ asString( asObject( payload.issue ).title ) }"`;
		case 'PullRequestReviewEvent':
		case 'PullRequestReviewCommentEvent':
			return `reviewed PR #${ asNumber(
				asObject( payload.pull_request ).number
			) }`;
		case 'CreateEvent': {
			const ref = asString( payload.ref );
			return `created ${ asString( payload.ref_type ) }${
				ref ? ` ${ ref }` : ''
			}`;
		}
		case 'DeleteEvent':
			return `deleted ${ asString( payload.ref_type ) } ${ asString(
				payload.ref
			) }`;
		case 'ReleaseEvent':
			return `${ asString( payload.action ) } release ${ asString(
				asObject( payload.release ).tag_name
			) }`;
		case 'ForkEvent':
			return 'forked the repo';
		case 'WatchEvent':
			return 'starred the repo';
		default:
			return '';
	}
}

function slimEvent( item: Record< string, unknown > ) {
	const summary = summarizeEvent(
		asString( item.type ),
		asObject( item.payload )
	);
	return {
		type: asString( item.type ),
		actor: asString( asObject( item.actor ).login ),
		repo: asString( asObject( item.repo ).name ),
		created_at: asString( item.created_at ),
		...( summary ? { summary } : {} ),
	};
}

function slimCommit( item: Record< string, unknown > ) {
	const commit = asObject( item.commit );
	const author = asObject( commit.author );
	return {
		sha: asString( item.sha ).slice( 0, 7 ),
		message: firstLine( asString( commit.message ) ),
		author:
			asString( author.name ) ||
			asString( asObject( item.author ).login ),
		date: asString( author.date ),
		url: asString( item.html_url ),
	};
}

function slimRelease( item: Record< string, unknown > ) {
	const body = asString( item.body ).trim();
	return {
		tag: asString( item.tag_name ),
		name: asString( item.name ),
		published: asString( item.published_at ),
		url: asString( item.html_url ),
		...( item.prerelease === true ? { prerelease: true as const } : {} ),
		...( item.draft === true ? { draft: true as const } : {} ),
		...( body
			? {
					body:
						body.length > RELEASE_BODY_MAX_CHARS
							? `${ body.slice(
									0,
									RELEASE_BODY_MAX_CHARS
							  ) }… [truncated]`
							: body,
			  }
			: {} ),
	};
}

// Parses a GitHub API array response and keeps only the fields the agent reads.
// Throws if the body isn't valid JSON — the caller turns that into a tool error.
export function slimGithubResponse( rawJson: string, kind: GithubFeedKind ) {
	const parsed = JSON.parse( rawJson ) as unknown;
	const rows = Array.isArray( parsed ) ? parsed : [];
	const items = rows
		.map( ( row ) => asObject( row ) )
		.map( ( row ) => {
			if ( kind === 'commits' ) {
				return slimCommit( row );
			}
			if ( kind === 'releases' ) {
				return slimRelease( row );
			}
			return slimEvent( row );
		} );
	return { kind, count: items.length, items };
}

export const githubActivityTool = tool(
	'github_activity',
	"Fetch recent public GitHub activity. Provide `user` for a person's " +
		"public events, or `owner` + `repo` for a repository's recent " +
		'commits, releases, or events. Returns a JSON object ' +
		'{ kind, count, items } with a compact summary per item.',
	{
		owner: z
			.string()
			.optional()
			.describe( 'Repository owner (use with `repo`).' ),
		repo: z
			.string()
			.optional()
			.describe( 'Repository name (use with `owner`).' ),
		user: z
			.string()
			.optional()
			.describe( "A GitHub username, for that account's public events." ),
		kind: z
			.enum( [ 'events', 'commits', 'releases' ] )
			.optional()
			.describe(
				'For a repository: which feed to fetch. Defaults to commits.'
			),
	},
	async ( args ) => {
		let url: string;
		let kind: GithubFeedKind;
		if ( args.user ) {
			url = `https://api.github.com/users/${ safeName(
				args.user
			) }/events/public`;
			kind = 'events';
		} else if ( args.owner && args.repo ) {
			const slug = `${ safeName( args.owner ) }/${ safeName(
				args.repo
			) }`;
			kind = args.kind ?? 'commits';
			url = `https://api.github.com/repos/${ slug }/${ kind }`;
		} else {
			return toolError(
				'github_activity needs either `user`, or both `owner` and `repo`.'
			);
		}
		try {
			const res = await httpGet( url, {
				accept: 'application/vnd.github+json',
				headers: GH_HEADERS,
				maxChars: GITHUB_BODY_MAX_CHARS,
			} );
			if ( res.status === 403 || res.status === 429 ) {
				return toolError(
					'GitHub rate limit reached (unauthenticated requests are ' +
						'limited). Try again later.'
				);
			}
			if ( ! res.ok ) {
				return toolError(
					`GitHub request failed (HTTP ${ res.status }) for ${ url }.`
				);
			}
			if ( res.truncated ) {
				return toolError(
					'GitHub returned an unexpectedly large response.'
				);
			}
			const slim = slimGithubResponse( res.body, kind );
			return toolText( JSON.stringify( slim, null, 2 ) );
		} catch ( err ) {
			if ( err instanceof SyntaxError ) {
				return toolError(
					'GitHub returned a response that could not be parsed as JSON.'
				);
			}
			return toolError(
				`GitHub request failed: ${ errMessage( err ) }.`
			);
		}
	}
);
