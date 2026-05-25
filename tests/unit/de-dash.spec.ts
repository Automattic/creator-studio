import { describe, expect, it } from 'vitest';

import { deDash } from '../../src/main/channels/utils/de-dash';

describe( 'deDash', () => {
	it( 'replaces a spaced em dash with a comma', () => {
		expect( deDash( 'the shape holds — but the details shift' ) ).toBe(
			'the shape holds, but the details shift'
		);
	} );

	it( 'replaces a tight em dash between words', () => {
		expect( deDash( 'serpents coil—guardians prowl' ) ).toBe(
			'serpents coil, guardians prowl'
		);
	} );

	it( 'handles en dashes too', () => {
		expect( deDash( 'pages 10 – 20' ) ).toBe( 'pages 10, 20' );
	} );

	it( 'collapses a dash that lands next to an existing comma', () => {
		expect( deDash( 'one, — two' ) ).toBe( 'one, two' );
	} );

	it( 'leaves dash-free text untouched', () => {
		expect( deDash( 'plain sentence, nothing fancy.' ) ).toBe(
			'plain sentence, nothing fancy.'
		);
	} );

	it( 'trims surrounding whitespace', () => {
		expect( deDash( '  hello  ' ) ).toBe( 'hello' );
	} );
} );
