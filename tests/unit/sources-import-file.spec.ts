import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test } from 'vitest';

import { pickAvailableFileName } from '../../src/main/channels/sources-import-file';

let dir = '';

beforeEach( () => {
	dir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-sources-pick-' ) );
} );

describe( 'pickAvailableFileName — arbitrary-extension dedup', () => {
	test( 'returns the original name when nothing collides', () => {
		expect( pickAvailableFileName( dir, 'foo.png' ) ).toBe( 'foo.png' );
		expect( pickAvailableFileName( dir, 'notes.md' ) ).toBe( 'notes.md' );
		expect( pickAvailableFileName( dir, 'archive.tar.gz' ) ).toBe(
			'archive.tar.gz'
		);
	} );

	test( 'inserts -N before the final extension on collision', () => {
		fs.writeFileSync( path.join( dir, 'foo.png' ), '' );
		expect( pickAvailableFileName( dir, 'foo.png' ) ).toBe( 'foo-2.png' );
		fs.writeFileSync( path.join( dir, 'foo-2.png' ), '' );
		expect( pickAvailableFileName( dir, 'foo.png' ) ).toBe( 'foo-3.png' );
	} );

	test( 'treats compound extensions as a single trailing token', () => {
		fs.writeFileSync( path.join( dir, 'archive.tar.gz' ), '' );
		// Only the final dot is treated as the extension boundary; we keep
		// .tar as part of the stem so users see `archive.tar-2.gz`. The dedup
		// stays predictable for the common single-extension case.
		expect( pickAvailableFileName( dir, 'archive.tar.gz' ) ).toBe(
			'archive.tar-2.gz'
		);
	} );

	test( 'handles dotfiles by suffixing the whole name', () => {
		fs.writeFileSync( path.join( dir, '.env' ), '' );
		expect( pickAvailableFileName( dir, '.env' ) ).toBe( '.env-2' );
	} );

	test( 'handles names with no extension', () => {
		fs.writeFileSync( path.join( dir, 'README' ), '' );
		expect( pickAvailableFileName( dir, 'README' ) ).toBe( 'README-2' );
	} );

	test( 'returns null after 1000 collisions', () => {
		fs.writeFileSync( path.join( dir, 'busy.md' ), '' );
		for ( let i = 2; i <= 1000; i++ ) {
			fs.writeFileSync( path.join( dir, `busy-${ i }.md` ), '' );
		}
		expect( pickAvailableFileName( dir, 'busy.md' ) ).toBeNull();
	} );
} );
