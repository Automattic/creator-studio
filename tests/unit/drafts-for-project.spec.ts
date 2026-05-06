import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { draftsForProject } from '../../src/main/channels/utils/drafts-for-project';
import type { Project } from '../../src/types';

function makeProject( workDir: string ): Project {
	return {
		id: randomUUID(),
		path: workDir,
		label: path.basename( workDir ),
		name: path.basename( workDir ),
	};
}

function seed( dir: string, file: string, body: string ): void {
	fs.mkdirSync( dir, { recursive: true } );
	fs.writeFileSync( path.join( dir, file ), body );
}

describe( 'draftsForProject(folder)', () => {
	test( 'defaults to drafts/ and ignores done/', () => {
		const root = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-dfp-' ) );
		seed( path.join( root, 'drafts' ), 'a.md', '# A\n' );
		seed( path.join( root, 'done' ), 'b.md', '# B\n' );
		const list = draftsForProject( makeProject( root ) );
		expect( list.map( ( d ) => d.relPath ) ).toEqual( [ 'a.md' ] );
	} );

	test( 'reads from done/ when folder=done', () => {
		const root = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-dfp-' ) );
		seed( path.join( root, 'drafts' ), 'a.md', '# A\n' );
		seed( path.join( root, 'done' ), 'b.md', '# B\n' );
		seed( path.join( root, 'done' ), 'c.md', '# C\n' );
		const list = draftsForProject( makeProject( root ), 'done' );
		expect( list.map( ( d ) => d.relPath ).sort() ).toEqual( [
			'b.md',
			'c.md',
		] );
	} );

	test( 'returns [] when the folder does not exist', () => {
		const root = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-dfp-' ) );
		// Only drafts/ exists; reading done/ should be a clean empty.
		seed( path.join( root, 'drafts' ), 'a.md', '# A\n' );
		const list = draftsForProject( makeProject( root ), 'done' );
		expect( list ).toEqual( [] );
	} );

	test( 'sorts results newest first by mtime', () => {
		const root = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-dfp-' ) );
		const doneDir = path.join( root, 'done' );
		seed( doneDir, 'older.md', '# Older\n' );
		seed( doneDir, 'newer.md', '# Newer\n' );
		// Force older.md to be older than newer.md.
		const older = Date.now() / 1000 - 60;
		fs.utimesSync( path.join( doneDir, 'older.md' ), older, older );
		const list = draftsForProject( makeProject( root ), 'done' );
		expect( list.map( ( d ) => d.relPath ) ).toEqual( [
			'newer.md',
			'older.md',
		] );
	} );
} );
