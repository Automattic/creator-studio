import { describe, expect, it } from 'vitest';

import {
	normalizeIssues,
	parseModelOutput,
} from '../../src/main/channels/utils/draft-checks';
import { shiftIssuesAfterApply } from '../../src/renderer/editor/draft-check-decorations';
import type { DraftCheckIssue } from '../../src/types';

describe( 'parseModelOutput', () => {
	it( 'parses a bare JSON array', () => {
		expect( parseModelOutput( '[{"x":1}]' ) ).toEqual( [ { x: 1 } ] );
	} );

	it( 'strips a ```json fence', () => {
		const raw = '```json\n[{"x":1}]\n```';
		expect( parseModelOutput( raw ) ).toEqual( [ { x: 1 } ] );
	} );

	it( 'strips an unlabeled ``` fence', () => {
		expect( parseModelOutput( '```\n[]\n```' ) ).toEqual( [] );
	} );

	it( 'extracts the first JSON array from leading prose', () => {
		const raw = 'Here are the issues:\n[{"x":1},{"y":2}]\nThanks.';
		expect( parseModelOutput( raw ) ).toEqual( [ { x: 1 }, { y: 2 } ] );
	} );

	it( 'throws on output with no array', () => {
		expect( () => parseModelOutput( 'no array here' ) ).toThrow();
	} );

	it( 'throws on malformed JSON', () => {
		expect( () => parseModelOutput( '[not, valid' ) ).toThrow();
	} );
} );

describe( 'normalizeIssues', () => {
	it( 'locates exact snippets and stamps offsets', () => {
		const body = 'The waves was touching the shore.';
		const out = normalizeIssues( 'grammar-spelling', body, [
			{
				original: 'waves was',
				replacement: 'waves were',
				message: 'agreement',
			},
		] );
		expect( out ).toHaveLength( 1 );
		expect( out[ 0 ].from ).toBe( 4 );
		expect( out[ 0 ].to ).toBe( 13 );
		expect( out[ 0 ].kind ).toBe( 'grammar-spelling' );
		expect( out[ 0 ].id ).toBeTruthy();
	} );

	it( 'drops entries whose original is not in the body', () => {
		const body = 'Nothing here.';
		const out = normalizeIssues( 'brevity', body, [
			{
				original: 'in order to',
				replacement: 'to',
				message: '',
			},
		] );
		expect( out ).toEqual( [] );
	} );

	it( 'takes the first occurrence when original appears multiple times', () => {
		const body = 'foo bar foo';
		const out = normalizeIssues( 'brevity', body, [
			{ original: 'foo', replacement: 'baz', message: '' },
		] );
		expect( out ).toHaveLength( 1 );
		expect( out[ 0 ].from ).toBe( 0 );
		expect( out[ 0 ].to ).toBe( 3 );
	} );

	it( 'dedupes exact duplicate entries', () => {
		const body = 'foo';
		const out = normalizeIssues( 'brevity', body, [
			{ original: 'foo', replacement: 'bar', message: 'a' },
			{ original: 'foo', replacement: 'bar', message: 'b' },
		] );
		expect( out ).toHaveLength( 1 );
	} );

	it( 'keeps two entries for the same original with different replacements', () => {
		const body = 'foo';
		const out = normalizeIssues( 'brevity', body, [
			{ original: 'foo', replacement: 'bar', message: 'a' },
			{ original: 'foo', replacement: 'baz', message: 'b' },
		] );
		expect( out ).toHaveLength( 2 );
	} );
} );

describe( 'shiftIssuesAfterApply', () => {
	const issue = (
		id: string,
		from: number,
		to: number,
		original: string,
		replacement = ''
	): DraftCheckIssue => ( {
		id,
		kind: 'brevity',
		from,
		to,
		original,
		replacement,
		message: '',
	} );

	it( 'shifts issues after the replaced range by the length delta', () => {
		const applied = issue( 'a', 0, 11, 'in order to', 'to' );
		const later = issue( 'b', 20, 23, 'foo' );
		const result = shiftIssuesAfterApply( [ applied, later ], applied );
		expect( result ).toHaveLength( 1 );
		expect( result[ 0 ].id ).toBe( 'b' );
		// delta = 2 - 11 = -9
		expect( result[ 0 ].from ).toBe( 11 );
		expect( result[ 0 ].to ).toBe( 14 );
	} );

	it( 'leaves issues before the replaced range untouched', () => {
		const applied = issue( 'a', 10, 14, 'was', 'were' );
		const earlier = issue( 'b', 0, 3, 'The' );
		const result = shiftIssuesAfterApply( [ applied, earlier ], applied );
		expect( result ).toHaveLength( 1 );
		expect( result[ 0 ] ).toMatchObject( { from: 0, to: 3 } );
	} );

	it( 'drops issues whose range overlaps the replaced span', () => {
		const applied = issue( 'a', 4, 13, 'waves was', 'waves were' );
		const overlap = issue( 'b', 10, 13, 'was', 'were' );
		const result = shiftIssuesAfterApply( [ applied, overlap ], applied );
		expect( result ).toEqual( [] );
	} );

	it( 'drops the applied issue from the result', () => {
		const applied = issue( 'a', 0, 3, 'foo', 'bar' );
		const result = shiftIssuesAfterApply( [ applied ], applied );
		expect( result ).toEqual( [] );
	} );
} );
