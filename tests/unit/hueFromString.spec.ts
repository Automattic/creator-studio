import { describe, it, expect } from 'vitest';

import { hueFromString } from '../../src/renderer/lib/hueFromString';

describe( 'hueFromString', () => {
	it( 'returns the same hue for the same input', () => {
		const a = hueFromString( 'project-abc-123' );
		const b = hueFromString( 'project-abc-123' );
		expect( a ).toBe( b );
	} );

	it( 'returns a value in [0, 359]', () => {
		for ( const s of [
			'',
			'a',
			'project',
			'a very long project identifier that includes UUID 7b6f8c40-1234',
		] ) {
			const h = hueFromString( s );
			expect( h ).toBeGreaterThanOrEqual( 0 );
			expect( h ).toBeLessThan( 360 );
		}
	} );

	it( 'distributes different inputs to different buckets', () => {
		// Not a strict requirement, but a sanity check that the hash isn't
		// degenerate — three short strings should land on at least two
		// distinct hues.
		const hues = new Set( [
			hueFromString( 'one' ),
			hueFromString( 'two' ),
			hueFromString( 'three' ),
		] );
		expect( hues.size ).toBeGreaterThan( 1 );
	} );
} );
