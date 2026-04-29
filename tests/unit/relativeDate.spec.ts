import { describe, expect, test } from 'vitest';

import { relativeDate } from '../../src/renderer/lib/relativeDate';

const NOW = new Date( '2026-04-29T12:00:00Z' ).getTime();

describe( 'relativeDate', () => {
	test( 'returns "now" for fresh and future timestamps', () => {
		expect( relativeDate( NOW, NOW ) ).toBe( 'now' );
		expect( relativeDate( NOW + 5_000, NOW ) ).toBe( 'now' );
		expect( relativeDate( NOW - 30_000, NOW ) ).toBe( 'now' );
	} );

	test( 'minutes within an hour', () => {
		expect( relativeDate( NOW - 5 * 60_000, NOW ) ).toBe( '5m' );
		expect( relativeDate( NOW - 59 * 60_000, NOW ) ).toBe( '59m' );
	} );

	test( 'hours within a day', () => {
		expect( relativeDate( NOW - 2 * 3_600_000, NOW ) ).toBe( '2h' );
		expect( relativeDate( NOW - 23 * 3_600_000, NOW ) ).toBe( '23h' );
	} );

	test( 'days within a week', () => {
		expect( relativeDate( NOW - 2 * 86_400_000, NOW ) ).toBe( '2d' );
		expect( relativeDate( NOW - 6 * 86_400_000, NOW ) ).toBe( '6d' );
	} );

	test( 'month + day for older same-year timestamps', () => {
		const mar4 = new Date( '2026-03-04T10:00:00Z' ).getTime();
		expect( relativeDate( mar4, NOW ) ).toBe( 'Mar 4' );
	} );

	test( 'year for cross-year timestamps', () => {
		const lastYear = new Date( '2024-08-12T10:00:00Z' ).getTime();
		expect( relativeDate( lastYear, NOW ) ).toBe( '2024' );
	} );
} );
