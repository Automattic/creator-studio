import { describe, expect, it } from 'vitest';

import { aiTellIds } from '../../src/renderer/lib/aiTellIds';
import type { CoachIssue } from '../../src/types';

const issue = (
	id: string,
	category: CoachIssue[ 'category' ]
): CoachIssue => ( {
	id,
	category,
	from: 0,
	to: 1,
	original: 'x',
	replacement: 'y',
	label: 'l',
	explanation: 'e',
	tip: null,
} );

describe( 'aiTellIds', () => {
	it( 'returns only the ids of ai-category findings', () => {
		const issues = [
			issue( 'a', 'ai' ),
			issue( 'g', 'grammar' ),
			issue( 'b', 'ai' ),
			issue( 'c', 'clarity' ),
			issue( 'v', 'voice' ),
		];
		expect( aiTellIds( issues ) ).toEqual( [ 'a', 'b' ] );
	} );

	it( 'returns an empty array when there are no ai findings', () => {
		expect( aiTellIds( [ issue( 'g', 'grammar' ) ] ) ).toEqual( [] );
		expect( aiTellIds( [] ) ).toEqual( [] );
	} );
} );
