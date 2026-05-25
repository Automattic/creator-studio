import { describe, expect, it } from 'vitest';

import { rewriteVariantPolicy } from '../../src/main/channels/utils/coach-normalize';
import type { CoachRewriteAction } from '../../src/types';

describe( 'rewriteVariantPolicy', () => {
	it( 'returns two variants for every subjective action', () => {
		const subjective: CoachRewriteAction[] = [
			'beautify',
			'natural',
			'simpler',
			'rephrase',
			'humanize',
			'myVoice',
		];
		for ( const action of subjective ) {
			expect( rewriteVariantPolicy( action ) ).toBe( 2 );
		}
	} );

	it( 'returns a single authoritative candidate for fix', () => {
		expect( rewriteVariantPolicy( 'fix' ) ).toBe( 1 );
	} );
} );
