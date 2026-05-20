import { describe, expect, test } from 'vitest';

import { pickPostModifiedDate } from '../../src/main/channels/utils/wordpress-post-date';

describe( 'pickPostModifiedDate', () => {
	test( 'prefers modified_gmt, parsed as UTC', () => {
		const d = pickPostModifiedDate( {
			modified_gmt: '2024-05-15T10:30:00',
			modified: '2024-05-15T06:30:00',
		} );
		expect( d?.toISOString() ).toBe( '2024-05-15T10:30:00.000Z' );
	} );

	test( 'accepts a modified_gmt that already carries a Z suffix', () => {
		const d = pickPostModifiedDate( {
			modified_gmt: '2024-05-15T10:30:00Z',
		} );
		expect( d?.toISOString() ).toBe( '2024-05-15T10:30:00.000Z' );
	} );

	test( 'falls back to date_gmt when modified_gmt is absent', () => {
		const d = pickPostModifiedDate( {
			date_gmt: '2023-01-02T03:04:05',
		} );
		expect( d?.toISOString() ).toBe( '2023-01-02T03:04:05.000Z' );
	} );

	test( 'falls back to the site-local modified field as a last resort', () => {
		const d = pickPostModifiedDate( {
			modified: '2022-11-09T08:07:06',
		} );
		expect( d ).toBeInstanceOf( Date );
		expect( Number.isNaN( d?.getTime() ) ).toBe( false );
	} );

	test( 'returns null when no date field is present', () => {
		expect( pickPostModifiedDate( {} ) ).toBeNull();
	} );

	test( 'returns null when the date strings are unparseable', () => {
		expect(
			pickPostModifiedDate( { modified_gmt: 'not-a-date' } )
		).toBeNull();
	} );
} );
