import { describe, expect, it } from 'vitest';

import {
	countSyllables,
	readability,
} from '../../src/renderer/lib/readability';

describe( 'countSyllables', () => {
	it( 'counts short words as one', () => {
		expect( countSyllables( 'cat' ) ).toBe( 1 );
		expect( countSyllables( 'the' ) ).toBe( 1 );
	} );

	it( 'counts multi-syllable words', () => {
		expect( countSyllables( 'water' ) ).toBe( 2 );
		expect( countSyllables( 'beautiful' ) ).toBeGreaterThanOrEqual( 3 );
	} );

	it( 'returns 0 for non-letters', () => {
		expect( countSyllables( '123' ) ).toBe( 0 );
	} );
} );

describe( 'readability', () => {
	it( 'returns null for trivially short text', () => {
		expect( readability( 'Hi.' ) ).toBeNull();
	} );

	it( 'produces a plausible grade for simple prose', () => {
		const r = readability( 'The cat sat on the mat. The dog ran fast.' );
		expect( r ).not.toBeNull();
		expect( r!.sentences ).toBe( 2 );
		expect( r!.words ).toBe( 10 );
		expect( r!.grade ).toBeGreaterThanOrEqual( 1 );
	} );

	it( 'rates dense prose at a higher grade than simple prose', () => {
		const simple = readability(
			'I go to the shop. I buy milk. I walk home.'
		);
		const dense = readability(
			'The implementation necessitates considerable architectural reconsideration, particularly regarding interdependent subsystems.'
		);
		expect( dense!.grade ).toBeGreaterThan( simple!.grade );
	} );
} );
