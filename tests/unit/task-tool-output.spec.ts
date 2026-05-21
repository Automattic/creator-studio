import { describe, expect, test } from 'vitest';

import {
	slimRedditListing,
	cutoffMs,
	filterToWindow,
	buildWindowEnvelope,
} from '../../src/main/channels/utils/task-tools/reddit';
import { slimGithubResponse } from '../../src/main/channels/utils/task-tools/github';
import {
	MAX_RESULT_CHARS,
	toolText,
} from '../../src/main/channels/utils/task-tools/result';

function redditListing( children: unknown[], after: string | null = null ) {
	return JSON.stringify( {
		kind: 'Listing',
		data: { after, children },
	} );
}

function t3( data: Record< string, unknown > ) {
	return { kind: 't3', data };
}

describe( 'slimRedditListing', () => {
	test( 'keeps only the useful fields and builds a full permalink', () => {
		const raw = redditListing(
			[
				t3( {
					title: 'Hello',
					author: 'alice',
					subreddit: 'WordPress',
					score: 42,
					num_comments: 7,
					created_utc: 1_700_000_000,
					permalink: '/r/WordPress/comments/abc/hello/',
					is_self: true,
					selftext: 'a short post',
					all_awardings: [ { huge: 'payload' } ],
				} ),
			],
			't3_next'
		);
		const { posts, after } = slimRedditListing( raw );
		expect( after ).toBe( 't3_next' );
		expect( posts ).toHaveLength( 1 );
		expect( posts[ 0 ] ).toEqual( {
			title: 'Hello',
			author: 'alice',
			subreddit: 'WordPress',
			score: 42,
			num_comments: 7,
			created: new Date( 1_700_000_000 * 1000 ).toISOString(),
			permalink: 'https://www.reddit.com/r/WordPress/comments/abc/hello/',
			selftext: 'a short post',
		} );
	} );

	test( 'includes url for link posts and omits it for self posts', () => {
		const { posts } = slimRedditListing(
			redditListing( [
				t3( { is_self: false, url: 'https://example.com/article' } ),
				t3( { is_self: true, url: 'https://reddit.com/self' } ),
			] )
		);
		expect( posts[ 0 ].url ).toBe( 'https://example.com/article' );
		expect( posts[ 1 ].url ).toBeUndefined();
	} );

	test( 'truncates a long selftext', () => {
		const long = 'x'.repeat( 5_000 );
		const { posts } = slimRedditListing(
			redditListing( [ t3( { selftext: long } ) ] )
		);
		expect( posts[ 0 ].selftext!.length ).toBeLessThan( 1_000 );
		expect( posts[ 0 ].selftext ).toContain( '[truncated' );
		expect( posts[ 0 ].selftext!.startsWith( 'x'.repeat( 600 ) ) ).toBe(
			true
		);
	} );

	test( 'skips non-t3 children and tolerates a missing after', () => {
		const { posts, after } = slimRedditListing(
			redditListing( [
				{ kind: 't1', data: { body: 'a comment' } },
				t3( { title: 'Real post' } ),
			] )
		);
		expect( posts ).toHaveLength( 1 );
		expect( posts[ 0 ].title ).toBe( 'Real post' );
		expect( after ).toBeNull();
	} );

	test( 'throws a SyntaxError on a non-JSON body', () => {
		expect( () =>
			slimRedditListing( '<html>rate limited</html>' )
		).toThrow( SyntaxError );
	} );
} );

describe( 'slimGithubResponse', () => {
	test( 'slims commits: short sha, first message line, author fallback', () => {
		const raw = JSON.stringify( [
			{
				sha: 'abcdef1234567890',
				commit: {
					message: 'fix: the thing\n\nlong body text',
					author: { name: 'Jane', date: '2026-05-01T00:00:00Z' },
				},
				author: { login: 'jane-gh' },
				html_url: 'https://github.com/o/r/commit/abcdef1',
			},
			{
				sha: 'fedcba9876543210',
				commit: { message: 'chore: bump', author: {} },
				author: { login: 'bot-account' },
				html_url: 'https://github.com/o/r/commit/fedcba9',
			},
		] );
		const { kind, count, items } = slimGithubResponse( raw, 'commits' );
		expect( kind ).toBe( 'commits' );
		expect( count ).toBe( 2 );
		expect( items[ 0 ] ).toEqual( {
			sha: 'abcdef1',
			message: 'fix: the thing',
			author: 'Jane',
			date: '2026-05-01T00:00:00Z',
			url: 'https://github.com/o/r/commit/abcdef1',
		} );
		expect( items[ 1 ] ).toMatchObject( { author: 'bot-account' } );
	} );

	test( 'slims events with a per-type summary', () => {
		const raw = JSON.stringify( [
			{
				type: 'PushEvent',
				actor: { login: 'jane' },
				repo: { name: 'o/r' },
				created_at: '2026-05-02T00:00:00Z',
				payload: {
					size: 3,
					commits: [ { message: 'first commit\nmore' } ],
				},
			},
			{
				type: 'WatchEvent',
				actor: { login: 'bob' },
				repo: { name: 'o/r' },
				created_at: '2026-05-03T00:00:00Z',
				payload: { action: 'started' },
			},
		] );
		const { items } = slimGithubResponse( raw, 'events' );
		expect( items[ 0 ] ).toEqual( {
			type: 'PushEvent',
			actor: 'jane',
			repo: 'o/r',
			created_at: '2026-05-02T00:00:00Z',
			summary: 'pushed 3 commit(s): "first commit"',
		} );
		expect( items[ 1 ] ).toMatchObject( {
			summary: 'starred the repo',
		} );
	} );

	test( 'slims releases and truncates a long body', () => {
		const raw = JSON.stringify( [
			{
				tag_name: 'v2.0',
				name: 'Version 2',
				published_at: '2026-05-04T00:00:00Z',
				html_url: 'https://github.com/o/r/releases/v2.0',
				prerelease: true,
				body: 'y'.repeat( 5_000 ),
			},
		] );
		const { items } = slimGithubResponse( raw, 'releases' );
		expect( items[ 0 ] ).toMatchObject( {
			tag: 'v2.0',
			name: 'Version 2',
			prerelease: true,
		} );
		const body = ( items[ 0 ] as { body: string } ).body;
		expect( body.length ).toBeLessThan( 1_000 );
		expect( body ).toContain( '[truncated]' );
	} );

	test( 'returns an empty list for a non-array response', () => {
		const { count, items } = slimGithubResponse(
			JSON.stringify( { message: 'Not Found' } ),
			'commits'
		);
		expect( count ).toBe( 0 );
		expect( items ).toEqual( [] );
	} );

	test( 'throws a SyntaxError on a non-JSON body', () => {
		expect( () => slimGithubResponse( 'not json', 'events' ) ).toThrow(
			SyntaxError
		);
	} );
} );

describe( 'toolText result cap', () => {
	test( 'leaves a small payload untouched', () => {
		const result = toolText( 'hello' );
		expect( result.content[ 0 ].text ).toBe( 'hello' );
	} );

	test( 'truncates an oversized payload below the cap', () => {
		const result = toolText( 'x'.repeat( MAX_RESULT_CHARS * 2 ) );
		expect( result.content[ 0 ].text.length ).toBeLessThanOrEqual(
			MAX_RESULT_CHARS
		);
		expect( result.content[ 0 ].text ).toContain( 'Output truncated' );
	} );
} );

// Fixed "now" so the cutoff is deterministic: 30 days back is 2026-04-21.
const NOW = Date.parse( '2026-05-21T00:00:00.000Z' );

function windowPost( created: string, score = 1, selftext = '' ) {
	return {
		title: 'A post title',
		author: 'author',
		subreddit: 'WordPress',
		score,
		num_comments: 2,
		created,
		permalink: 'https://www.reddit.com/r/WordPress/comments/abc/a_post/',
		selftext,
	};
}

describe( 'cutoffMs', () => {
	test( 'subtracts N days of milliseconds from now', () => {
		const now = 1_700_000_000_000;
		expect( cutoffMs( 30, now ) ).toBe( now - 30 * 24 * 60 * 60 * 1000 );
	} );
} );

describe( 'filterToWindow', () => {
	test( 'drops posts older than the cutoff and keeps recent ones', () => {
		const kept = filterToWindow(
			[
				windowPost( '2026-05-20T00:00:00.000Z' ),
				windowPost( '2026-03-01T00:00:00.000Z' ),
				windowPost( '2026-05-10T00:00:00.000Z' ),
			],
			30,
			NOW
		);
		expect( kept.map( ( p ) => p.created ) ).toEqual( [
			'2026-05-20T00:00:00.000Z',
			'2026-05-10T00:00:00.000Z',
		] );
	} );

	test( 'keeps a post with a missing timestamp', () => {
		const kept = filterToWindow(
			[ windowPost( '' ), windowPost( '2026-03-01T00:00:00.000Z' ) ],
			30,
			NOW
		);
		expect( kept ).toHaveLength( 1 );
		expect( kept[ 0 ].created ).toBe( '' );
	} );
} );

describe( 'buildWindowEnvelope', () => {
	test( 'ranks posts by score, most popular first', () => {
		const envelope = buildWindowEnvelope(
			[
				windowPost( '2026-05-10T00:00:00.000Z', 5 ),
				windowPost( '2026-05-11T00:00:00.000Z', 99 ),
				windowPost( '2026-05-12T00:00:00.000Z', 40 ),
			],
			{ days: 30, timeFilter: 'month', cappedByApi: false }
		);
		expect( envelope.posts.map( ( p ) => p.score ) ).toEqual( [
			99, 40, 5,
		] );
		expect( envelope.count ).toBe( 3 );
		expect( envelope.complete ).toBe( true );
		expect( envelope.ranked_by ).toBe( 'score' );
	} );

	test( 'is not complete when the API capped the listing', () => {
		const envelope = buildWindowEnvelope(
			[ windowPost( '2026-05-10T00:00:00.000Z', 5 ) ],
			{ days: 30, timeFilter: 'month', cappedByApi: true }
		);
		expect( envelope.complete ).toBe( false );
		expect( envelope.note ).toContain( 'top' );
	} );

	test( 'reports an empty window cleanly', () => {
		const envelope = buildWindowEnvelope( [], {
			days: 30,
			timeFilter: 'month',
			cappedByApi: false,
		} );
		expect( envelope.count ).toBe( 0 );
		expect( envelope.posts ).toHaveLength( 0 );
		expect( envelope.note ).toContain( 'No posts' );
	} );

	test( 'trims the lowest-scored posts to keep the minified JSON small', () => {
		const heavy = 'x'.repeat( 240 );
		const posts = Array.from( { length: 100 }, ( _, i ) =>
			windowPost(
				new Date(
					Date.UTC( 2026, 4, 21 ) - i * 60 * 60 * 1000
				).toISOString(),
				1000 - i,
				heavy
			)
		);
		const envelope = buildWindowEnvelope( posts, {
			days: 30,
			timeFilter: 'month',
			cappedByApi: false,
		} );
		const json = JSON.stringify( envelope );
		expect( json.length ).toBeLessThan( 40_000 );
		expect( () => JSON.parse( json ) ).not.toThrow();
		// `count` keeps the true total even though posts were trimmed.
		expect( envelope.count ).toBe( 100 );
		expect( envelope.serialized ).toBe( envelope.posts.length );
		expect( envelope.serialized ).toBeLessThan( envelope.count );
		// The trimmed slice keeps the highest-scored posts.
		expect( envelope.posts[ 0 ].score ).toBe( 1000 );
		expect( envelope.complete ).toBe( false );
	} );
} );
