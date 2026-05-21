import { describe, expect, it } from 'vitest';

import { headlineScore } from '../../src/renderer/lib/headlineScore';
import type { CoachScoreDimension } from '../../src/types';

const dims = ( ...scores: number[] ): CoachScoreDimension[] =>
	scores.map( ( score, i ) => ( {
		key: (
			[ 'clarity', 'structure', 'engagement', 'correctness' ] as const
		 )[ i ],
		score,
		note: '',
	} ) );

describe( 'headlineScore', () => {
	it( 'returns null when there are no dimensions', () => {
		expect( headlineScore( [] ) ).toBeNull();
	} );

	it( 'returns the rounded mean of the dimensions', () => {
		expect( headlineScore( dims( 4, 4, 4, 4 ) ) ).toBe( 4 );
		// mean 3.5 rounds to 4
		expect( headlineScore( dims( 5, 3, 3, 3 ) ) ).toBe( 4 );
		// mean 3.25 rounds to 3
		expect( headlineScore( dims( 4, 3, 3, 3 ) ) ).toBe( 3 );
	} );

	it( 'handles a single dimension', () => {
		expect( headlineScore( dims( 2 ) ) ).toBe( 2 );
	} );
} );
