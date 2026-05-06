import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
	pickAvailableSlug,
	slugifyTitle,
} from '../../src/main/channels/utils/draft-slug';

describe( 'slugifyTitle', () => {
	test( 'lowercases ASCII and replaces spaces with hyphens', () => {
		expect( slugifyTitle( 'Hello World' ) ).toBe( 'hello-world' );
		expect( slugifyTitle( 'My Essay About Dogs' ) ).toBe(
			'my-essay-about-dogs'
		);
	} );

	test( 'strips diacritics via NFKD', () => {
		expect( slugifyTitle( 'Café' ) ).toBe( 'cafe' );
		expect( slugifyTitle( 'naïve résumé' ) ).toBe( 'naive-resume' );
	} );

	test( 'collapses repeated whitespace and underscores', () => {
		expect( slugifyTitle( '  Multiple   spaces  ' ) ).toBe(
			'multiple-spaces'
		);
		expect( slugifyTitle( 'snake_case_title' ) ).toBe( 'snake-case-title' );
		expect( slugifyTitle( 'mixed_  spacing\t\nthings' ) ).toBe(
			'mixed-spacing-things'
		);
	} );

	test( 'collapses repeated hyphens', () => {
		expect( slugifyTitle( 'a -- b ---- c' ) ).toBe( 'a-b-c' );
	} );

	test( 'trims leading/trailing hyphens', () => {
		expect( slugifyTitle( '---trim me---' ) ).toBe( 'trim-me' );
	} );

	test( 'returns null when nothing survives sanitization', () => {
		expect( slugifyTitle( '' ) ).toBeNull();
		expect( slugifyTitle( '   ' ) ).toBeNull();
		expect( slugifyTitle( '!!!???' ) ).toBeNull();
		expect( slugifyTitle( '🎉✨' ) ).toBeNull();
	} );

	test( 'never produces a leading dot', () => {
		// Dots are stripped by the alphanumeric filter, so this can't produce
		// a hidden file even when the title leads with one.
		expect( slugifyTitle( '.hidden' ) ).toBe( 'hidden' );
		expect( slugifyTitle( '...so dotty' ) ).toBe( 'so-dotty' );
	} );

	test( 'caps long titles at 60 chars at a word boundary', () => {
		const long = 'a'.repeat( 100 );
		const result = slugifyTitle( long );
		expect( result ).not.toBeNull();
		expect( ( result as string ).length ).toBeLessThanOrEqual( 60 );
	} );

	test( 'cuts long multi-word titles at the last hyphen in the second half', () => {
		// 80-char title with hyphen-separated words; cap is 60.
		const title =
			'one two three four five six seven eight nine ten eleven twelve';
		const result = slugifyTitle( title );
		expect( result ).not.toBeNull();
		const slug = result as string;
		expect( slug.length ).toBeLessThanOrEqual( 60 );
		// Should end on a complete word, not a partial.
		expect( slug.endsWith( '-' ) ).toBe( false );
		expect( slug.startsWith( 'one-two-three' ) ).toBe( true );
	} );

	test( 'numbers and basic ascii pass through', () => {
		expect( slugifyTitle( 'Chapter 1: The Beginning' ) ).toBe(
			'chapter-1-the-beginning'
		);
	} );
} );

describe( 'pickAvailableSlug', () => {
	let tmpDir: string;

	beforeEach( () => {
		tmpDir = fs.mkdtempSync( path.join( os.tmpdir(), 'draft-slug-' ) );
	} );

	afterEach( () => {
		fs.rmSync( tmpDir, { force: true, recursive: true } );
	} );

	test( 'returns desired name when no collision', () => {
		expect( pickAvailableSlug( tmpDir, 'sunny-bear', null ) ).toBe(
			'sunny-bear.md'
		);
	} );

	test( 'returns the same name when the only collision is the draft itself', () => {
		fs.writeFileSync( path.join( tmpDir, 'sunny-bear.md' ), '' );
		expect(
			pickAvailableSlug( tmpDir, 'sunny-bear', 'sunny-bear.md' )
		).toBe( 'sunny-bear.md' );
	} );

	test( 'self-collision is case-insensitive (macOS APFS default)', () => {
		fs.writeFileSync( path.join( tmpDir, 'Sunny-Bear.md' ), '' );
		expect(
			pickAvailableSlug( tmpDir, 'sunny-bear', 'Sunny-Bear.md' )
		).toBe( 'sunny-bear.md' );
	} );

	test( 'suffixes -2, -3 on collision with another file', () => {
		fs.writeFileSync( path.join( tmpDir, 'sunny-bear.md' ), '' );
		expect( pickAvailableSlug( tmpDir, 'sunny-bear', null ) ).toBe(
			'sunny-bear-2.md'
		);
		fs.writeFileSync( path.join( tmpDir, 'sunny-bear-2.md' ), '' );
		expect( pickAvailableSlug( tmpDir, 'sunny-bear', null ) ).toBe(
			'sunny-bear-3.md'
		);
	} );

	test( 'a -2 candidate that matches the current file is acceptable', () => {
		fs.writeFileSync( path.join( tmpDir, 'sunny-bear.md' ), '' );
		fs.writeFileSync( path.join( tmpDir, 'sunny-bear-2.md' ), '' );
		// Renaming "sunny-bear-2.md" with desired slug "sunny-bear" should
		// short-circuit: -1 is taken by another file, but -2 is itself.
		expect(
			pickAvailableSlug( tmpDir, 'sunny-bear', 'sunny-bear-2.md' )
		).toBe( 'sunny-bear-2.md' );
	} );
} );
