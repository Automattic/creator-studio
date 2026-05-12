import { describe, expect, test } from 'vitest';

import { parseDraft } from '../../src/main/channels/utils/parse-draft';

describe( 'parseDraft', () => {
	test( 'title and description come from frontmatter when present', () => {
		const raw = [
			'---',
			'title: April recap',
			'description: A short overview.',
			'---',
			'',
			'Body paragraph that should not become the description.',
		].join( '\n' );
		const result = parseDraft( raw, 'whatever.md' );
		expect( result.title ).toBe( 'April recap' );
		expect( result.titleFromFrontmatter ).toBe( true );
		expect( result.description ).toBe( 'A short overview.' );
	} );

	test( 'falls back to filename without .md when no frontmatter title', () => {
		const result = parseDraft( 'Just body.', 'My Draft.md' );
		expect( result.title ).toBe( 'My Draft' );
		expect( result.titleFromFrontmatter ).toBe( false );
	} );

	test( 'titleFromFrontmatter is false when the title field is blank', () => {
		const raw = [ '---', 'title:   ', '---', 'body.' ].join( '\n' );
		const result = parseDraft( raw, 'note.md' );
		expect( result.title ).toBe( 'note' );
		expect( result.titleFromFrontmatter ).toBe( false );
	} );

	test( 'falls back to first paragraph when no frontmatter description', () => {
		const raw = [
			'# Heading',
			'',
			'First paragraph here.',
			'',
			'Second paragraph here.',
		].join( '\n' );
		const result = parseDraft( raw, 'note.md' );
		// `# Heading` is the first paragraph; markers are stripped.
		expect( result.description ).toBe( 'Heading' );
	} );

	test( 'description from `excerpt` if `description` is missing', () => {
		const raw = [
			'---',
			'title: t',
			'excerpt: From excerpt.',
			'---',
			'Body.',
		].join( '\n' );
		expect( parseDraft( raw, 'x.md' ).description ).toBe( 'From excerpt.' );
	} );

	test( 'description is truncated to ~240 chars with an ellipsis', () => {
		const longParagraph = 'word '.repeat( 80 ).trim(); // ~400 chars
		const raw = `${ longParagraph }`;
		const result = parseDraft( raw, 'long.md' );
		expect( result.description.length ).toBeLessThanOrEqual( 240 );
		expect( result.description.endsWith( '…' ) ).toBe( true );
	} );

	test( 'word count counts whitespace tokens in the body', () => {
		const raw = 'one two three four five';
		expect( parseDraft( raw, 'x.md' ).wordCount ).toBe( 5 );
	} );

	test( 'word count excludes frontmatter', () => {
		const raw = [
			'---',
			'title: ignored',
			'description: also ignored',
			'---',
			'one two three',
		].join( '\n' );
		expect( parseDraft( raw, 'x.md' ).wordCount ).toBe( 3 );
	} );

	test( 'word count excludes fenced code blocks', () => {
		const raw = [
			'one two three',
			'',
			'```ts',
			'const a = 1;',
			'const b = 2;',
			'console.log( a + b );',
			'```',
			'',
			'four five',
		].join( '\n' );
		expect( parseDraft( raw, 'x.md' ).wordCount ).toBe( 5 );
	} );

	test( 'first paragraph also skips fenced code blocks', () => {
		const raw = [
			'```ts',
			'const noisy = 42;',
			'```',
			'',
			'The actual prose.',
		].join( '\n' );
		expect( parseDraft( raw, 'x.md' ).description ).toBe(
			'The actual prose.'
		);
	} );

	test( 'empty body produces empty description and zero words', () => {
		const result = parseDraft( '', 'empty.md' );
		expect( result.title ).toBe( 'empty' );
		expect( result.description ).toBe( '' );
		expect( result.wordCount ).toBe( 0 );
	} );
} );
