import { describe, expect, it } from 'vitest';

import {
	normalizeIssues,
	parseModelOutput,
} from '../../src/main/channels/utils/draft-checks';
import {
	planBulkApply,
	shiftIssuesAfterApply,
} from '../../src/renderer/editor/draft-check-decorations';
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
		const out = normalizeIssues(
			'grammar-spelling.md',
			'Grammar and spelling',
			body,
			[
				{
					original: 'waves was',
					replacement: 'waves were',
					message: 'agreement',
				},
			]
		);
		expect( out ).toHaveLength( 1 );
		expect( out[ 0 ].from ).toBe( 4 );
		expect( out[ 0 ].to ).toBe( 13 );
		expect( out[ 0 ].checkRelPath ).toBe( 'grammar-spelling.md' );
		expect( out[ 0 ].checkTitle ).toBe( 'Grammar and spelling' );
		expect( out[ 0 ].id ).toBeTruthy();
	} );

	it( 'drops entries whose original is not in the body', () => {
		const body = 'Nothing here.';
		const out = normalizeIssues( 'brevity.md', 'Brevity', body, [
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
		const out = normalizeIssues( 'brevity.md', 'Brevity', body, [
			{ original: 'foo', replacement: 'baz', message: '' },
		] );
		expect( out ).toHaveLength( 1 );
		expect( out[ 0 ].from ).toBe( 0 );
		expect( out[ 0 ].to ).toBe( 3 );
	} );

	it( 'dedupes exact duplicate entries', () => {
		const body = 'foo';
		const out = normalizeIssues( 'brevity.md', 'Brevity', body, [
			{ original: 'foo', replacement: 'bar', message: 'a' },
			{ original: 'foo', replacement: 'bar', message: 'b' },
		] );
		expect( out ).toHaveLength( 1 );
	} );

	it( 'keeps two entries for the same original with different replacements', () => {
		const body = 'foo';
		const out = normalizeIssues( 'brevity.md', 'Brevity', body, [
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
		checkRelPath: 'brevity.md',
		checkTitle: 'Brevity',
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

describe( 'planBulkApply', () => {
	const issue = (
		id: string,
		from: number,
		to: number,
		original: string,
		replacement = ''
	): DraftCheckIssue => ( {
		id,
		checkRelPath: 'brevity.md',
		checkTitle: 'Brevity',
		from,
		to,
		original,
		replacement,
		message: '',
	} );

	it( 'returns no changes and the input list when ids is empty', () => {
		const a = issue( 'a', 0, 3, 'foo', 'bar' );
		const result = planBulkApply( [ a ], [] );
		expect( result.changes ).toEqual( [] );
		expect( result.survivors ).toEqual( [ a ] );
	} );

	it( 'emits one change per requested id and clears them from survivors', () => {
		// Two non-overlapping issues; "  in order to  foo" → "  to  bar"
		const a = issue( 'a', 0, 11, 'in order to', 'to' );
		const b = issue( 'b', 20, 23, 'foo', 'bar' );
		const result = planBulkApply( [ a, b ], [ 'a', 'b' ] );
		expect( result.changes ).toHaveLength( 2 );
		expect( result.survivors ).toEqual( [] );
	} );

	it( 'sorts changes descending by `from` regardless of input id order', () => {
		const a = issue( 'a', 0, 11, 'in order to', 'to' );
		const b = issue( 'b', 20, 23, 'foo', 'bar' );
		const result = planBulkApply( [ a, b ], [ 'a', 'b' ] );
		const inputOrderResult = planBulkApply( [ a, b ], [ 'b', 'a' ] );
		expect( result.changes ).toEqual( inputOrderResult.changes );
		expect( result.changes[ 0 ].from ).toBe( 20 );
		expect( result.changes[ 1 ].from ).toBe( 0 );
	} );

	it( "keeps each change's offsets valid against the unchanged left portion of the doc", () => {
		// Right-to-left: the rightmost change uses original offsets (20, 23),
		// the leftmost change uses its own original offsets (0, 11). No
		// pre-shifting needed because we process the rightmost change first
		// and the doc is mutated right-to-left.
		const a = issue( 'a', 0, 11, 'in order to', 'to' );
		const b = issue( 'b', 20, 23, 'foo', 'bar' );
		const { changes } = planBulkApply( [ a, b ], [ 'a', 'b' ] );
		// Sorted descending — `b` (rightmost) first, then `a`.
		expect( changes[ 0 ] ).toEqual( { from: 20, to: 23, insert: 'bar' } );
		expect( changes[ 1 ] ).toEqual( { from: 0, to: 11, insert: 'to' } );
	} );

	it( 'drops an overlapping inner issue when the outer issue is applied', () => {
		// `a` covers `b`. Both requested. Right-to-left iteration: `b` (from=10)
		// is processed first, `a` (from=4) second. After `b` applies it is in
		// the survivors-removed list; then `a` applies — `b` was already
		// shifted/dropped depending on overlap. With identical-from order
		// sorting by `from` DESC puts `b` first.
		const a = issue( 'a', 4, 13, 'waves was', 'waves were' );
		const b = issue( 'b', 10, 13, 'was', 'were' );
		const { changes, survivors } = planBulkApply( [ a, b ], [ 'a', 'b' ] );
		// Only one change emitted — the overlap means the second iteration's
		// target is missing from `survivors` and gets skipped.
		expect( changes ).toHaveLength( 1 );
		expect( survivors ).toEqual( [] );
	} );

	it( 'leaves issues not in `ids` in the survivor list with shifted offsets', () => {
		const applied = issue( 'a', 0, 11, 'in order to', 'to' );
		const untouched = issue( 'b', 20, 23, 'foo', 'bar' );
		const { changes, survivors } = planBulkApply(
			[ applied, untouched ],
			[ 'a' ]
		);
		expect( changes ).toHaveLength( 1 );
		expect( survivors ).toHaveLength( 1 );
		expect( survivors[ 0 ].id ).toBe( 'b' );
		// delta = 2 - 11 = -9 → from 20 - 9 = 11
		expect( survivors[ 0 ].from ).toBe( 11 );
		expect( survivors[ 0 ].to ).toBe( 14 );
	} );

	it( 'silently skips unknown ids', () => {
		const a = issue( 'a', 0, 3, 'foo', 'bar' );
		const { changes, survivors } = planBulkApply(
			[ a ],
			[ 'a', 'nonexistent' ]
		);
		expect( changes ).toHaveLength( 1 );
		expect( survivors ).toEqual( [] );
	} );
} );
