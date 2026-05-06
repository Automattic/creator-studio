import { describe, expect, test } from 'vitest';

import { classifyUrl } from '../../src/main/channels/utils/url-classifier';

describe( 'classifyUrl', () => {
	test( 'classifies a watch URL on www.youtube.com as youtube', () => {
		const result = classifyUrl(
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
		);
		expect( result?.kind ).toBe( 'youtube' );
		expect( result?.hostname ).toBe( 'www.youtube.com' );
	} );

	test( 'classifies the youtu.be short host as youtube', () => {
		const result = classifyUrl( 'https://youtu.be/dQw4w9WgXcQ' );
		expect( result?.kind ).toBe( 'youtube' );
	} );

	test( 'classifies m.youtube.com and music.youtube.com as youtube', () => {
		expect( classifyUrl( 'https://m.youtube.com/watch?v=abc' )?.kind ).toBe(
			'youtube'
		);
		expect(
			classifyUrl( 'https://music.youtube.com/watch?v=abc' )?.kind
		).toBe( 'youtube' );
	} );

	test( 'classifies twitter.com and x.com as tweet', () => {
		expect(
			classifyUrl( 'https://twitter.com/foo/status/123' )?.kind
		).toBe( 'tweet' );
		expect( classifyUrl( 'https://x.com/foo/status/123' )?.kind ).toBe(
			'tweet'
		);
		expect(
			classifyUrl( 'https://mobile.x.com/foo/status/123' )?.kind
		).toBe( 'tweet' );
	} );

	test( 'falls back to website for any other host', () => {
		expect( classifyUrl( 'https://example.com/foo/bar' )?.kind ).toBe(
			'website'
		);
		expect(
			classifyUrl( 'https://news.ycombinator.com/item?id=1' )?.kind
		).toBe( 'website' );
	} );

	test( 'auto-prefixes https:// when the input lacks a scheme', () => {
		const result = classifyUrl( 'example.com/foo' );
		expect( result?.normalizedUrl ).toBe( 'https://example.com/foo' );
		expect( result?.kind ).toBe( 'website' );
	} );

	test( 'preserves http when the user typed it explicitly', () => {
		const result = classifyUrl( 'http://example.com' );
		expect( result?.normalizedUrl ).toBe( 'http://example.com/' );
	} );

	test( 'trims whitespace before parsing', () => {
		const result = classifyUrl(
			'   https://www.youtube.com/watch?v=abc \n'
		);
		expect( result?.kind ).toBe( 'youtube' );
		expect( result?.normalizedUrl ).toBe(
			'https://www.youtube.com/watch?v=abc'
		);
	} );

	test( 'lowercases the hostname for routing', () => {
		const result = classifyUrl( 'https://WWW.YouTube.com/watch?v=abc' );
		expect( result?.hostname ).toBe( 'www.youtube.com' );
		expect( result?.kind ).toBe( 'youtube' );
	} );

	test( 'returns null for an empty or whitespace-only input', () => {
		expect( classifyUrl( '' ) ).toBeNull();
		expect( classifyUrl( '   \n' ) ).toBeNull();
	} );

	test( 'returns null for non-http(s) schemes', () => {
		expect( classifyUrl( 'ftp://example.com/foo' ) ).toBeNull();
		expect( classifyUrl( 'file:///etc/hosts' ) ).toBeNull();
		expect( classifyUrl( 'javascript:alert(1)' ) ).toBeNull();
	} );

	test( 'returns null for unparseable input', () => {
		expect( classifyUrl( 'not a url at all' ) ).toBeNull();
	} );
} );
