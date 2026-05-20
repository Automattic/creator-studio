import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import matter from 'gray-matter';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted( () => ( { userDataDir: '' } ) );

vi.mock( 'electron', () => ( {
	app: {
		getPath: ( name: string ) => {
			if ( name === 'userData' ) {
				return mocks.userDataDir;
			}
			throw new Error( `Unexpected app.getPath(${ name })` );
		},
	},
} ) );

import {
	listSnapshots,
	readSnapshot,
	restoreSnapshot,
	takeSnapshot,
} from '../../src/main/channels/utils/draft-history';
import {
	readStore,
	writeStore,
} from '../../src/main/channels/utils/project-store';
import type { Project } from '../../src/types';

let project: Project;
let workDir: string;

function writeDraft( relPath: string, title: string, body: string ): void {
	const file = path.join( workDir, 'drafts', relPath );
	fs.mkdirSync( path.dirname( file ), { recursive: true } );
	fs.writeFileSync( file, matter.stringify( body, { title } ), 'utf-8' );
}

function readDraftFile( relPath: string ): string {
	return fs.readFileSync( path.join( workDir, 'drafts', relPath ), 'utf-8' );
}

beforeEach( () => {
	mocks.userDataDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'sw-history-userdata-' )
	);
	workDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-history-project-' ) );
	fs.mkdirSync( path.join( workDir, 'drafts' ), { recursive: true } );
	project = {
		id: randomUUID(),
		path: workDir,
		label: path.basename( workDir ),
		name: path.basename( workDir ),
	};
	const store = readStore();
	store.projects.push( project );
	writeStore( store );
} );

afterEach( () => {
	try {
		fs.rmSync( mocks.userDataDir, { recursive: true, force: true } );
		fs.rmSync( workDir, { recursive: true, force: true } );
	} catch {
		// best effort
	}
} );

describe( 'draft-history', () => {
	test( 'takeSnapshot writes a file under .studio-write/history/<folder>/<relPath>.d/', () => {
		writeDraft( 'hello.md', 'Hello', '# Hi\n\nFirst draft body.' );
		const res = takeSnapshot( project.id, 'drafts', 'hello.md', 'manual' );
		expect( res.ok ).toBe( true );
		if ( ! res.ok ) {
			return;
		}
		const expectedDir = path.join(
			workDir,
			'.studio-write',
			'history',
			'drafts',
			'hello.md.d'
		);
		expect( fs.existsSync( expectedDir ) ).toBe( true );
		expect(
			fs.existsSync( path.join( expectedDir, res.snapshot.id ) )
		).toBe( true );
		const stored = JSON.parse(
			fs.readFileSync(
				path.join( expectedDir, res.snapshot.id ),
				'utf-8'
			)
		) as {
			title: string;
			body: string;
			frontmatter: Record< string, unknown >;
			source: string;
		};
		expect( stored.title ).toBe( 'Hello' );
		// gray-matter normalises a trailing newline onto the body when it
		// round-trips through stringify/parse — assert on content, not on
		// exact whitespace at the boundary.
		expect( stored.body.trim() ).toBe( '# Hi\n\nFirst draft body.' );
		expect( stored.frontmatter ).toEqual( {} );
		expect( stored.source ).toBe( 'manual' );
	} );

	test( 'listSnapshots returns newest-first', async () => {
		writeDraft( 'a.md', 'A', 'v1' );
		const first = takeSnapshot( project.id, 'drafts', 'a.md', 'manual' );
		// Sleep one millisecond so the second snapshot gets a later mtime.
		// Filenames are ISO-with-ms so this is enough resolution.
		await new Promise( ( r ) => setTimeout( r, 2 ) );
		writeDraft( 'a.md', 'A', 'v2' );
		const second = takeSnapshot( project.id, 'drafts', 'a.md', 'agent' );
		expect( first.ok ).toBe( true );
		expect( second.ok ).toBe( true );
		if ( ! first.ok || ! second.ok ) {
			return;
		}
		const list = listSnapshots( project.id, 'drafts', 'a.md' );
		expect( list.map( ( s ) => s.id ) ).toEqual( [
			second.snapshot.id,
			first.snapshot.id,
		] );
		expect( list[ 0 ].source ).toBe( 'agent' );
		expect( list[ 1 ].source ).toBe( 'manual' );
	} );

	test( 'readSnapshot returns the full stored payload', () => {
		writeDraft( 'b.md', 'B', 'body B' );
		const taken = takeSnapshot( project.id, 'drafts', 'b.md', 'manual' );
		expect( taken.ok ).toBe( true );
		if ( ! taken.ok ) {
			return;
		}
		const read = readSnapshot(
			project.id,
			'drafts',
			'b.md',
			taken.snapshot.id
		);
		expect( read.ok ).toBe( true );
		if ( ! read.ok ) {
			return;
		}
		expect( read.snapshot.title ).toBe( 'B' );
		expect( read.snapshot.body.trim() ).toBe( 'body B' );
		expect( read.snapshot.source ).toBe( 'manual' );
	} );

	test( 'readSnapshot refuses malformed ids that would escape the dir', () => {
		writeDraft( 'c.md', 'C', 'body' );
		takeSnapshot( project.id, 'drafts', 'c.md', 'manual' );
		const res = readSnapshot(
			project.id,
			'drafts',
			'c.md',
			'../../../etc/passwd'
		);
		expect( res.ok ).toBe( false );
		if ( res.ok === false ) {
			expect( res.reason ).toBe( 'not-found' );
		}
	} );

	test( 'restoreSnapshot writes a pre-restore safety snapshot before overwriting', () => {
		writeDraft( 'd.md', 'D', 'original body' );
		const v1 = takeSnapshot( project.id, 'drafts', 'd.md', 'manual' );
		expect( v1.ok ).toBe( true );
		if ( ! v1.ok ) {
			return;
		}
		// Mutate the live file so restore actually overwrites something.
		writeDraft( 'd.md', 'D', 'edited body that we want to roll back' );
		const restored = restoreSnapshot(
			project.id,
			'drafts',
			'd.md',
			v1.snapshot.id
		);
		expect( restored.ok ).toBe( true );
		if ( ! restored.ok ) {
			return;
		}
		// The pre-restore meta belongs to a new snapshot that captured the
		// edited state — confirms the safety net ran before the overwrite.
		expect( restored.preRestore.source ).toBe( 'pre-restore' );
		const preRestore = readSnapshot(
			project.id,
			'drafts',
			'd.md',
			restored.preRestore.id
		);
		expect( preRestore.ok ).toBe( true );
		if ( preRestore.ok ) {
			expect( preRestore.snapshot.body.trim() ).toBe(
				'edited body that we want to roll back'
			);
		}
		// Live file should now hold the v1 body again.
		expect( readDraftFile( 'd.md' ) ).toContain( 'original body' );
		// The list has at least two entries: v1 + pre-restore.
		const afterList = listSnapshots( project.id, 'drafts', 'd.md' );
		expect( afterList.length ).toBeGreaterThanOrEqual( 2 );
	} );

	test( 'takeSnapshot returns not-found when the project does not exist', () => {
		const res = takeSnapshot(
			'unknown-project',
			'drafts',
			'whatever.md',
			'manual'
		);
		expect( res.ok ).toBe( false );
		if ( res.ok === false ) {
			expect( res.reason ).toBe( 'not-found' );
		}
	} );

	test( 'takeSnapshot returns not-found for a missing draft file', () => {
		const res = takeSnapshot(
			project.id,
			'drafts',
			'never-written.md',
			'manual'
		);
		expect( res.ok ).toBe( false );
		if ( res.ok === false ) {
			expect( res.reason ).toBe( 'not-found' );
		}
	} );
} );
