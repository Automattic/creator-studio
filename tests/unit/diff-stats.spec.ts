import { diffWordsWithSpace } from 'diff';
import { describe, expect, test } from 'vitest';

import {
	computeDiffStats,
	type DiffPart,
} from '../../src/renderer/lib/diff-stats';

// The component pairs `diffWordsWithSpace` with `computeDiffStats`, so the
// tests run real jsdiff output through the helper rather than hand-crafting
// part arrays — that way a future jsdiff format change shows up here.
function statsFor(
	oldText: string,
	newText: string
): ReturnType< typeof computeDiffStats > {
	return computeDiffStats( diffWordsWithSpace( oldText, newText ) );
}

describe( 'computeDiffStats', () => {
	test( 'returns zeroes when the strings are identical', () => {
		expect( statsFor( 'hello world', 'hello world' ) ).toEqual( {
			edits: 0,
			added: 0,
			removed: 0,
		} );
	} );

	test( 'counts a pure addition as one edit', () => {
		expect( statsFor( 'hello', 'hello world' ) ).toEqual( {
			edits: 1,
			added: 1,
			removed: 0,
		} );
	} );

	test( 'counts a pure deletion as one edit', () => {
		expect( statsFor( 'hello world', 'hello' ) ).toEqual( {
			edits: 1,
			added: 0,
			removed: 1,
		} );
	} );

	test( 'collapses a replacement into a single edit', () => {
		// "world" -> "earth" is removed+added back-to-back. One edit, with
		// one word on each side of the counters.
		expect( statsFor( 'hello world', 'hello earth' ) ).toEqual( {
			edits: 1,
			added: 1,
			removed: 1,
		} );
	} );

	test( 'counts multiple non-adjacent change regions separately', () => {
		// Two edits: a replacement at the start, and an addition at the end.
		const stats = statsFor( 'foo bar baz', 'qux bar baz quux' );
		expect( stats.edits ).toBe( 2 );
		expect( stats.added ).toBe( 2 );
		expect( stats.removed ).toBe( 1 );
	} );

	test( 'is robust to leading and trailing whitespace in change parts', () => {
		// A leading space change adds a whitespace-only "added" part — the
		// word counter must not count whitespace as a word.
		const stats = statsFor( 'hello world', 'hello  world  extra' );
		expect( stats.added ).toBe( 1 );
		expect( stats.removed ).toBe( 0 );
		expect( stats.edits ).toBeGreaterThanOrEqual( 1 );
	} );

	test( 'handles an empty parts array', () => {
		expect( computeDiffStats( [] as DiffPart[] ) ).toEqual( {
			edits: 0,
			added: 0,
			removed: 0,
		} );
	} );
} );
