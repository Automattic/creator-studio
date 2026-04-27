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
	dialog: {
		showOpenDialog: () =>
			Promise.resolve( { canceled: true, filePaths: [] } ),
	},
} ) );

import {
	createFolder,
	getFolder,
	listFolders,
	removeFolder,
} from '../../src/main/services/folder';

describe( 'folderService', () => {
	beforeEach( () => {
		mocks.userDataDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'cs-test-userdata-' )
		);
	} );

	test( 'createFolder writes a record with name + goal', () => {
		const folder = createFolder( {
			path: '/tmp/some-project',
			name: 'My Project',
			goal: 'Be helpful',
		} );
		expect( folder.name ).toBe( 'My Project' );
		expect( folder.label ).toBe( 'some-project' );
		expect( folder.goal ).toBe( 'Be helpful' );
		expect( folder.path ).toBe( '/tmp/some-project' );

		const reloaded = getFolder( folder.id );
		expect( reloaded?.name ).toBe( 'My Project' );
		expect( reloaded?.goal ).toBe( 'Be helpful' );
	} );

	test( 'createFolder allows duplicate paths', () => {
		const a = createFolder( {
			path: '/tmp/shared',
			name: 'Project A',
		} );
		const b = createFolder( {
			path: '/tmp/shared',
			name: 'Project B',
			goal: 'different lens',
		} );
		expect( a.id ).not.toBe( b.id );
		const all = listFolders();
		expect( all ).toHaveLength( 2 );
		expect( all.map( ( f ) => f.path ) ).toEqual( [
			'/tmp/shared',
			'/tmp/shared',
		] );
	} );

	test( 'readStore migrates pre-modal records by backfilling name from label', () => {
		// Simulate a folders.json from before the modal feature: only id/path/label.
		fs.writeFileSync(
			path.join( mocks.userDataDir, 'folders.json' ),
			JSON.stringify( {
				folders: [
					{
						id: 'old-1',
						path: '/tmp/legacy',
						label: 'legacy',
					},
				],
			} ),
			'utf-8'
		);
		const list = listFolders();
		expect( list ).toHaveLength( 1 );
		expect( list[ 0 ].name ).toBe( 'legacy' );
		expect( list[ 0 ].label ).toBe( 'legacy' );
		expect( list[ 0 ].goal ).toBeUndefined();
	} );

	test( 'removeFolder drops a single record by id', () => {
		const a = createFolder( { path: '/tmp/a', name: 'A' } );
		const b = createFolder( { path: '/tmp/b', name: 'B' } );
		removeFolder( a.id );
		const remaining = listFolders();
		expect( remaining.map( ( f ) => f.id ) ).toEqual( [ b.id ] );
	} );
} );
