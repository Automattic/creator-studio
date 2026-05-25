import { describe, expect, it } from 'vitest';

import {
	clampScore,
	normalizeCoachReview,
	normalizeScoreDimensions,
} from '../../src/main/channels/utils/coach-normalize';

describe( 'normalizeCoachReview', () => {
	const body = 'The quick brown fox jumps over the lazy dog.';

	it( 'anchors issues to the body and stamps offsets', () => {
		const { issues } = normalizeCoachReview( body, {
			issues: [
				{
					category: 'grammar',
					original: 'quick brown fox',
					replacement: 'quick red fox',
					label: 'word choice',
					explanation: 'A red fox is more vivid.',
				},
			],
		} );
		expect( issues ).toHaveLength( 1 );
		expect( issues[ 0 ].from ).toBe( body.indexOf( 'quick brown fox' ) );
		expect( issues[ 0 ].to ).toBe(
			body.indexOf( 'quick brown fox' ) + 'quick brown fox'.length
		);
		expect( issues[ 0 ].id ).toBeTruthy();
	} );

	it( 'drops findings whose original is not a verbatim substring', () => {
		const { issues } = normalizeCoachReview( body, {
			issues: [
				{
					category: 'grammar',
					original: 'purple elephant',
					replacement: 'x',
					label: 'l',
					explanation: 'e',
				},
			],
		} );
		expect( issues ).toHaveLength( 0 );
	} );

	it( 'dedupes on the category + original→replacement key', () => {
		const dup = {
			category: 'clarity' as const,
			original: 'lazy dog',
			replacement: 'sleepy dog',
			label: 'l',
			explanation: 'e',
		};
		const { issues } = normalizeCoachReview( body, {
			issues: [ dup, { ...dup } ],
		} );
		expect( issues ).toHaveLength( 1 );
	} );

	it( 'de-dashes generated prose but leaves original verbatim', () => {
		const { issues } = normalizeCoachReview( body, {
			issues: [
				{
					category: 'ai',
					original: 'lazy dog',
					replacement: 'tired — sleepy dog',
					label: 'tell',
					explanation: 'Reads — like AI.',
					tip: 'avoid — dashes',
				},
			],
		} );
		expect( issues[ 0 ].original ).toBe( 'lazy dog' );
		expect( issues[ 0 ].replacement ).not.toContain( '—' );
		expect( issues[ 0 ].explanation ).not.toContain( '—' );
		expect( issues[ 0 ].tip ).not.toContain( '—' );
	} );

	it( 'passes register through and degrades a missing register to null', () => {
		expect(
			normalizeCoachReview( body, { register: 'formal', issues: [] } )
				.register
		).toBe( 'formal' );
		expect(
			normalizeCoachReview( body, { issues: [] } ).register
		).toBeNull();
	} );

	it( 'normalizes and clamps score dimensions', () => {
		const { dimensions } = normalizeCoachReview( body, {
			score: [
				{ key: 'clarity', score: 4, note: 'clear' },
				{ key: 'structure', score: 9, note: 'over the max' },
				{ key: 'engagement', score: 0, note: 'under the min' },
				{ key: 'correctness', score: 3.6 },
			],
			issues: [],
		} );
		expect( dimensions ).toEqual( [
			{ key: 'clarity', score: 4, note: 'clear' },
			{ key: 'structure', score: 5, note: 'over the max' },
			{ key: 'engagement', score: 1, note: 'under the min' },
			{ key: 'correctness', score: 4, note: '' },
		] );
	} );

	it( 'defaults missing score and issues arrays to empty', () => {
		const result = normalizeCoachReview( body, {} );
		expect( result.dimensions ).toEqual( [] );
		expect( result.issues ).toEqual( [] );
	} );

	it( 'clamps the AI-likeness rating and degrades a missing one to null', () => {
		expect(
			normalizeCoachReview( body, { ai: 4, issues: [] } ).aiLikeness
		).toBe( 4 );
		expect(
			normalizeCoachReview( body, { ai: 9, issues: [] } ).aiLikeness
		).toBe( 5 );
		expect(
			normalizeCoachReview( body, { issues: [] } ).aiLikeness
		).toBeNull();
	} );
} );

describe( 'clampScore', () => {
	it( 'clamps and rounds to the 1-5 range', () => {
		expect( clampScore( 0 ) ).toBe( 1 );
		expect( clampScore( 9 ) ).toBe( 5 );
		expect( clampScore( 3.4 ) ).toBe( 3 );
		expect( clampScore( 3.6 ) ).toBe( 4 );
	} );
} );

describe( 'normalizeScoreDimensions', () => {
	it( 'trims and de-dashes notes', () => {
		const [ d ] = normalizeScoreDimensions( [
			{ key: 'clarity', score: 4, note: '  clear — and tight  ' },
		] );
		expect( d.note ).toBe( 'clear, and tight' );
	} );
} );
