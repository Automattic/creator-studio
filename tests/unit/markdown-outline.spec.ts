import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';

import {
	activeHeadingIndex,
	extractHeadings,
	headingsEqual,
} from '../../src/renderer/editor/markdown-outline';

function stateOf( doc: string ): EditorState {
	return EditorState.create( {
		doc,
		extensions: [ markdown( { base: markdownLanguage } ) ],
	} );
}

describe( 'extractHeadings', () => {
	test( 'returns empty for documents without headings', () => {
		const result = extractHeadings(
			stateOf( 'Just a paragraph.\n\nAnother one.' )
		);
		expect( result ).toEqual( [] );
	} );

	test( 'extracts ATX headings with level, line, position, and trimmed text', () => {
		const doc = [
			'# First',
			'',
			'Body line.',
			'',
			'## Second heading',
			'',
			'### Third',
		].join( '\n' );
		const result = extractHeadings( stateOf( doc ) );
		expect( result ).toHaveLength( 3 );
		expect( result[ 0 ] ).toMatchObject( {
			level: 1,
			line: 1,
			text: 'First',
		} );
		expect( result[ 1 ] ).toMatchObject( {
			level: 2,
			line: 5,
			text: 'Second heading',
		} );
		expect( result[ 2 ] ).toMatchObject( {
			level: 3,
			line: 7,
			text: 'Third',
		} );
		// `pos` is the start of the heading line, not the start of the
		// heading marker — clicks dispatch a selection there.
		expect( result[ 0 ].pos ).toBe( 0 );
	} );

	test( 'handles all six ATX levels', () => {
		const doc = [
			'# h1',
			'## h2',
			'### h3',
			'#### h4',
			'##### h5',
			'###### h6',
		].join( '\n' );
		const result = extractHeadings( stateOf( doc ) );
		expect( result.map( ( h ) => h.level ) ).toEqual( [
			1, 2, 3, 4, 5, 6,
		] );
		expect( result.map( ( h ) => h.text ) ).toEqual( [
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
		] );
	} );

	test( 'ignores headings inside fenced code blocks', () => {
		const doc = [
			'# Real heading',
			'',
			'```',
			'# Not a heading',
			'## Also not',
			'```',
			'',
			'## Back to real',
		].join( '\n' );
		const result = extractHeadings( stateOf( doc ) );
		expect( result.map( ( h ) => h.text ) ).toEqual( [
			'Real heading',
			'Back to real',
		] );
	} );

	test( 'strips optional trailing hashes (closing-mark headings)', () => {
		const result = extractHeadings(
			stateOf( '# Title with trailing hashes ###' )
		);
		expect( result[ 0 ].text ).toBe( 'Title with trailing hashes' );
	} );

	test( 'seven `#` is no longer a heading', () => {
		const result = extractHeadings( stateOf( '####### Too deep' ) );
		expect( result ).toEqual( [] );
	} );
} );

describe( 'headingsEqual', () => {
	test( 'true when both lists are empty', () => {
		expect( headingsEqual( [], [] ) ).toBe( true );
	} );

	test( 'true for structurally identical lists', () => {
		const a = extractHeadings( stateOf( '# A\n## B' ) );
		const b = extractHeadings( stateOf( '# A\n## B' ) );
		expect( headingsEqual( a, b ) ).toBe( true );
	} );

	test( 'false when text differs', () => {
		const a = extractHeadings( stateOf( '# A' ) );
		const b = extractHeadings( stateOf( '# B' ) );
		expect( headingsEqual( a, b ) ).toBe( false );
	} );

	test( 'false when length differs', () => {
		const a = extractHeadings( stateOf( '# A' ) );
		const b = extractHeadings( stateOf( '# A\n## B' ) );
		expect( headingsEqual( a, b ) ).toBe( false );
	} );
} );

describe( 'activeHeadingIndex', () => {
	const headings = extractHeadings(
		stateOf( [ '# A', '', '## B', '', 'body', '', '## C' ].join( '\n' ) )
	);

	test( 'returns -1 when cursor sits before the first heading', () => {
		expect( activeHeadingIndex( headings, 0 ) ).toBe( -1 );
	} );

	test( 'matches the heading on the cursor line', () => {
		expect( activeHeadingIndex( headings, 1 ) ).toBe( 0 );
	} );

	test( 'matches the most recent preceding heading', () => {
		// cursor on `body` line — falls under the second heading.
		expect( activeHeadingIndex( headings, 5 ) ).toBe( 1 );
	} );

	test( 'returns the last entry when cursor is past every heading', () => {
		expect( activeHeadingIndex( headings, 99 ) ).toBe(
			headings.length - 1
		);
	} );

	test( 'returns -1 for an empty heading list', () => {
		expect( activeHeadingIndex( [], 5 ) ).toBe( -1 );
	} );
} );
