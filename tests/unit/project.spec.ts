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
	createProject,
	getProject,
	listProjects,
	removeProject,
} from '../../src/main/services/project';

describe( 'projectService', () => {
	beforeEach( () => {
		mocks.userDataDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'cs-test-userdata-' )
		);
	} );

	test( 'createProject writes a record with name + goal', () => {
		const project = createProject( {
			path: '/tmp/some-project',
			name: 'My Project',
			goal: 'Be helpful',
		} );
		expect( project.name ).toBe( 'My Project' );
		expect( project.label ).toBe( 'some-project' );
		expect( project.goal ).toBe( 'Be helpful' );
		expect( project.path ).toBe( '/tmp/some-project' );

		const reloaded = getProject( project.id );
		expect( reloaded?.name ).toBe( 'My Project' );
		expect( reloaded?.goal ).toBe( 'Be helpful' );
	} );

	test( 'createProject allows duplicate paths', () => {
		const a = createProject( {
			path: '/tmp/shared',
			name: 'Project A',
		} );
		const b = createProject( {
			path: '/tmp/shared',
			name: 'Project B',
			goal: 'different lens',
		} );
		expect( a.id ).not.toBe( b.id );
		const all = listProjects();
		expect( all ).toHaveLength( 2 );
		expect( all.map( ( p ) => p.path ) ).toEqual( [
			'/tmp/shared',
			'/tmp/shared',
		] );
	} );

	test( 'readStore migrates pre-modal records by backfilling name from label', () => {
		// Simulate a projects.json from before the modal feature: only id/path/label.
		fs.writeFileSync(
			path.join( mocks.userDataDir, 'projects.json' ),
			JSON.stringify( {
				projects: [
					{
						id: 'old-1',
						path: '/tmp/legacy',
						label: 'legacy',
					},
				],
			} ),
			'utf-8'
		);
		const list = listProjects();
		expect( list ).toHaveLength( 1 );
		expect( list[ 0 ].name ).toBe( 'legacy' );
		expect( list[ 0 ].label ).toBe( 'legacy' );
		expect( list[ 0 ].goal ).toBeUndefined();
	} );

	test( 'removeProject drops a single record by id', () => {
		const a = createProject( { path: '/tmp/a', name: 'A' } );
		const b = createProject( { path: '/tmp/b', name: 'B' } );
		removeProject( a.id );
		const remaining = listProjects();
		expect( remaining.map( ( p ) => p.id ) ).toEqual( [ b.id ] );
	} );
} );
