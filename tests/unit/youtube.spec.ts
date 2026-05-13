import { describe, expect, test } from 'vitest';

import { extractYouTubeVideoId } from '../../src/youtube';

describe( 'extractYouTubeVideoId', () => {
	test( 'pulls the v= query param off a watch URL', () => {
		expect(
			extractYouTubeVideoId(
				'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
			)
		).toBe( 'dQw4w9WgXcQ' );
	} );

	test( 'returns the path segment from a youtu.be short link', () => {
		expect( extractYouTubeVideoId( 'https://youtu.be/dQw4w9WgXcQ' ) ).toBe(
			'dQw4w9WgXcQ'
		);
	} );

	test( 'accepts m.youtube.com and music.youtube.com hosts', () => {
		expect(
			extractYouTubeVideoId( 'https://m.youtube.com/watch?v=abcdefghijk' )
		).toBe( 'abcdefghijk' );
		expect(
			extractYouTubeVideoId(
				'https://music.youtube.com/watch?v=abcdefghijk'
			)
		).toBe( 'abcdefghijk' );
	} );

	test( 'handles /shorts/<id> paths', () => {
		expect(
			extractYouTubeVideoId(
				'https://www.youtube.com/shorts/nOSxuaDgl3s'
			)
		).toBe( 'nOSxuaDgl3s' );
	} );

	test( 'returns null for non-YouTube hosts', () => {
		expect(
			extractYouTubeVideoId( 'https://example.com/watch?v=abc' )
		).toBe( null );
	} );

	test( 'returns null when the v param is too short or missing', () => {
		expect(
			extractYouTubeVideoId( 'https://www.youtube.com/watch?v=abc' )
		).toBe( null );
		expect( extractYouTubeVideoId( 'https://www.youtube.com/watch' ) ).toBe(
			null
		);
	} );

	test( 'returns null for malformed input', () => {
		expect( extractYouTubeVideoId( 'not a url' ) ).toBe( null );
		expect( extractYouTubeVideoId( '' ) ).toBe( null );
	} );
} );
