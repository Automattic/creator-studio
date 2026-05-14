import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

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

import { resourcesMove } from '../../src/main/channels/resources-move';
import {
	readStore,
	writeStore,
} from '../../src/main/channels/utils/project-store';
import type { Project } from '../../src/types';

function createProject( workDir: string ): Project {
	const store = readStore();
	const project: Project = {
		id: randomUUID(),
		path: workDir,
		label: path.basename( workDir ),
		name: path.basename( workDir ),
	};
	store.projects.push( project );
	writeStore( store );
	return project;
}

beforeEach( () => {
	mocks.userDataDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'sw-resources-move-' )
	);
} );

async function invokeMove(
	projectId: string,
	items: Array< {
		folder: 'sources' | 'drafts' | 'done';
		relPath: string;
		name: string;
		kind: 'file' | 'dir';
	} >,
	destFolder: 'sources' | 'drafts' | 'done',
	destSubPath: string
): Promise< {
	results: Array<
		| { ok: true; oldRelPath: string; newRelPath: string }
		| {
				ok: false;
				oldRelPath: string;
				reason:
					| 'not-found'
					| 'invalid-path'
					| 'into-own-descendant'
					| 'collision'
					| 'io-error';
		  }
	>;
} > {
	return ( await resourcesMove.invoke( {} as never, {
		projectId,
		items,
		destFolder,
		destSubPath,
	} ) ) as never;
}

describe( 'resources:move — happy path', () => {
	test( 'moves a sources file into a subfolder and clears the old path', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-move-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources', 'Logs' ), {
			recursive: true,
		} );
		fs.writeFileSync(
			path.join( workDir, 'sources', 'note.md' ),
			'hello',
			'utf-8'
		);

		const r = await invokeMove(
			project.id,
			[
				{
					folder: 'sources',
					relPath: 'note.md',
					name: 'note.md',
					kind: 'file',
				},
			],
			'sources',
			'sources/Logs'
		);
		expect( r.results ).toEqual( [
			{
				ok: true,
				oldRelPath: 'note.md',
				newRelPath: path.join( 'Logs', 'note.md' ),
			},
		] );
		expect(
			fs.existsSync( path.join( workDir, 'sources', 'note.md' ) )
		).toBe( false );
		expect(
			fs.existsSync( path.join( workDir, 'sources', 'Logs', 'note.md' ) )
		).toBe( true );
	} );

	test( 'dedups when the destination already has a file with the same name', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-move-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources', 'Logs' ), {
			recursive: true,
		} );
		fs.writeFileSync(
			path.join( workDir, 'sources', 'note.md' ),
			'incoming',
			'utf-8'
		);
		fs.writeFileSync(
			path.join( workDir, 'sources', 'Logs', 'note.md' ),
			'existing',
			'utf-8'
		);

		const r = await invokeMove(
			project.id,
			[
				{
					folder: 'sources',
					relPath: 'note.md',
					name: 'note.md',
					kind: 'file',
				},
			],
			'sources',
			'sources/Logs'
		);
		expect( r.results[ 0 ] ).toMatchObject( {
			ok: true,
			newRelPath: path.join( 'Logs', 'note-2.md' ),
		} );
		expect(
			fs.readFileSync(
				path.join( workDir, 'sources', 'Logs', 'note.md' ),
				'utf-8'
			)
		).toBe( 'existing' );
		expect(
			fs.readFileSync(
				path.join( workDir, 'sources', 'Logs', 'note-2.md' ),
				'utf-8'
			)
		).toBe( 'incoming' );
	} );

	test( 'no-op when the destination is the file’s current parent', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-move-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources' ), { recursive: true } );
		fs.writeFileSync(
			path.join( workDir, 'sources', 'note.md' ),
			'',
			'utf-8'
		);

		const r = await invokeMove(
			project.id,
			[
				{
					folder: 'sources',
					relPath: 'note.md',
					name: 'note.md',
					kind: 'file',
				},
			],
			'sources',
			'sources'
		);
		expect( r.results[ 0 ] ).toEqual( {
			ok: true,
			oldRelPath: 'note.md',
			newRelPath: 'note.md',
		} );
	} );
} );

describe( 'resources:move — rejections', () => {
	test( 'cross-group move is rejected with invalid-path', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-move-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources' ), { recursive: true } );
		fs.mkdirSync( path.join( workDir, 'drafts' ), { recursive: true } );
		fs.writeFileSync(
			path.join( workDir, 'sources', 'note.md' ),
			'',
			'utf-8'
		);

		const r = await invokeMove(
			project.id,
			[
				{
					folder: 'sources',
					relPath: 'note.md',
					name: 'note.md',
					kind: 'file',
				},
			],
			'drafts',
			'drafts'
		);
		expect( r.results[ 0 ] ).toMatchObject( {
			ok: false,
			reason: 'invalid-path',
		} );
		// The file did not move.
		expect(
			fs.existsSync( path.join( workDir, 'sources', 'note.md' ) )
		).toBe( true );
	} );

	test( 'moving a folder into one of its own descendants is rejected', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-move-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources', 'Logs', 'Old' ), {
			recursive: true,
		} );

		const r = await invokeMove(
			project.id,
			[
				{
					folder: 'sources',
					relPath: 'Logs',
					name: 'Logs',
					kind: 'dir',
				},
			],
			'sources',
			'sources/Logs/Old'
		);
		expect( r.results[ 0 ] ).toMatchObject( {
			ok: false,
			reason: 'into-own-descendant',
		} );
		// The folder still exists at its original location.
		expect( fs.existsSync( path.join( workDir, 'sources', 'Logs' ) ) ).toBe(
			true
		);
	} );

	test( 'moving a non-existent path returns not-found', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-move-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources', 'Logs' ), {
			recursive: true,
		} );

		const r = await invokeMove(
			project.id,
			[
				{
					folder: 'sources',
					relPath: 'ghost.md',
					name: 'ghost.md',
					kind: 'file',
				},
			],
			'sources',
			'sources/Logs'
		);
		expect( r.results[ 0 ] ).toMatchObject( {
			ok: false,
			reason: 'not-found',
		} );
	} );

	test( 'destSubPath escaping the group root returns invalid-path', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-move-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources' ), { recursive: true } );
		fs.writeFileSync(
			path.join( workDir, 'sources', 'note.md' ),
			'',
			'utf-8'
		);

		const r = await invokeMove(
			project.id,
			[
				{
					folder: 'sources',
					relPath: 'note.md',
					name: 'note.md',
					kind: 'file',
				},
			],
			'sources',
			// `drafts/` is outside the sources group root → reject.
			'drafts'
		);
		expect( r.results[ 0 ] ).toMatchObject( {
			ok: false,
			reason: 'invalid-path',
		} );
	} );
} );

describe( 'resources:move — partial failures', () => {
	test( 'one bad item does not abort the rest', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-move-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources', 'Logs' ), {
			recursive: true,
		} );
		fs.writeFileSync(
			path.join( workDir, 'sources', 'a.md' ),
			'',
			'utf-8'
		);

		const r = await invokeMove(
			project.id,
			[
				{
					folder: 'sources',
					relPath: 'a.md',
					name: 'a.md',
					kind: 'file',
				},
				{
					folder: 'sources',
					relPath: 'ghost.md',
					name: 'ghost.md',
					kind: 'file',
				},
			],
			'sources',
			'sources/Logs'
		);
		expect( r.results ).toHaveLength( 2 );
		expect( r.results[ 0 ] ).toMatchObject( { ok: true } );
		expect( r.results[ 1 ] ).toMatchObject( {
			ok: false,
			reason: 'not-found',
		} );
		expect(
			fs.existsSync( path.join( workDir, 'sources', 'Logs', 'a.md' ) )
		).toBe( true );
	} );
} );
