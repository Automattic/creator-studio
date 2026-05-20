import { describe, expect, it } from 'vitest';

import { wordDiff } from '../../src/renderer/lib/wordDiff';

const render = ( before: string, after: string ): string =>
	wordDiff( before, after )
		.map( ( p ) =>
			p.type === 'same'
				? p.text
				: `[${ p.type === 'del' ? '-' : '+' }${ p.text }]`
		)
		.join( '' );

describe( 'wordDiff', () => {
	it( 'returns all-same for identical text', () => {
		const parts = wordDiff( 'the cat sat', 'the cat sat' );
		expect( parts.every( ( p ) => p.type === 'same' ) ).toBe( true );
		expect( parts.map( ( p ) => p.text ).join( '' ) ).toBe( 'the cat sat' );
	} );

	it( 'marks a single replaced word', () => {
		expect( render( 'the cat sat', 'the dog sat' ) ).toBe(
			'the [-cat][+dog] sat'
		);
	} );

	it( 'marks an added word', () => {
		expect( render( 'the cat sat', 'the big cat sat' ) ).toBe(
			'the [+big ]cat sat'
		);
	} );

	it( 'marks a removed word', () => {
		expect( render( 'the big cat sat', 'the cat sat' ) ).toBe(
			'the [-big ]cat sat'
		);
	} );

	it( 'reconstructs before from same+del and after from same+add', () => {
		const parts = wordDiff(
			'serpents in the Americas',
			'serpents across the Americas'
		);
		const before = parts
			.filter( ( p ) => p.type !== 'add' )
			.map( ( p ) => p.text )
			.join( '' );
		const after = parts
			.filter( ( p ) => p.type !== 'del' )
			.map( ( p ) => p.text )
			.join( '' );
		expect( before ).toBe( 'serpents in the Americas' );
		expect( after ).toBe( 'serpents across the Americas' );
	} );
} );
