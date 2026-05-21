import { describe, expect, test } from 'vitest';

import { ordinal } from '../../src/renderer/lib/ordinal';

describe( 'ordinal', () => {
	test( 'appends st/nd/rd for 1–3', () => {
		expect( ordinal( 1 ) ).toBe( '1st' );
		expect( ordinal( 2 ) ).toBe( '2nd' );
		expect( ordinal( 3 ) ).toBe( '3rd' );
	} );

	test( 'appends th for 4–10', () => {
		expect( ordinal( 4 ) ).toBe( '4th' );
		expect( ordinal( 10 ) ).toBe( '10th' );
	} );

	test( 'appends th for the 11–13 exception', () => {
		expect( ordinal( 11 ) ).toBe( '11th' );
		expect( ordinal( 12 ) ).toBe( '12th' );
		expect( ordinal( 13 ) ).toBe( '13th' );
	} );

	test( 'handles 21/22/23/31 day-of-month values', () => {
		expect( ordinal( 21 ) ).toBe( '21st' );
		expect( ordinal( 22 ) ).toBe( '22nd' );
		expect( ordinal( 23 ) ).toBe( '23rd' );
		expect( ordinal( 31 ) ).toBe( '31st' );
	} );
} );
