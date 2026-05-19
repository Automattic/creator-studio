import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted( () => ( { userDataDir: '', documentsDir: '' } ) );

vi.mock( 'electron', () => ( {
	app: {
		getPath: ( name: string ) => {
			if ( name === 'userData' ) {
				return mocks.userDataDir;
			}
			if ( name === 'documents' ) {
				return mocks.documentsDir;
			}
			throw new Error( `Unexpected app.getPath(${ name })` );
		},
	},
} ) );

// projectCreateNew now seeds <project>/checks/ from the bundled defaults
// dir. Point the resolver at the real repo path so the seed succeeds under
// vitest (where neither the packaged nor the dev Electron path resolves).
vi.mock( '../../src/main/channels/utils/resource-paths', () => ( {
	resolveBundledChecksDefaultsDir: () =>
		path.join( process.cwd(), 'resources', 'checks-defaults' ),
} ) );

import {
	defaultParentDir,
	projectCreateNew,
	sanitizeFolderName,
} from '../../src/main/channels/project-create-new';
import { listProjects } from '../../src/main/channels/utils/projects-list';

const event = {} as never;

describe( 'sanitizeFolderName', () => {
	test( 'trims whitespace and collapses runs', () => {
		expect( sanitizeFolderName( '  My  Notes ' ) ).toBe( 'My Notes' );
	} );

	test( 'replaces path separators with dashes', () => {
		expect( sanitizeFolderName( 'a/b\\c' ) ).toBe( 'a-b-c' );
	} );

	test( 'strips leading dots so we never create a hidden folder', () => {
		expect( sanitizeFolderName( '...secret' ) ).toBe( 'secret' );
	} );

	test( 'falls back to "project" when everything is stripped', () => {
		expect( sanitizeFolderName( '   ' ) ).toBe( 'project' );
		expect( sanitizeFolderName( '///' ) ).toBe( '-' );
	} );
} );

describe( 'projectCreateNew', () => {
	beforeEach( () => {
		mocks.userDataDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-cn-userdata-' )
		);
		mocks.documentsDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-cn-docs-' )
		);
	} );

	test( 'defaultParentDir resolves under Documents', () => {
		expect( defaultParentDir() ).toBe(
			path.join( mocks.documentsDir, 'Studio Write' )
		);
	} );

	test( 'creates the folder under the default parent and registers the project', async () => {
		const parent = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-cn-parent-' )
		);
		const result = await projectCreateNew.invoke( event, {
			name: 'Brand New',
			parentDir: parent,
		} );
		expect( result ).toMatchObject( { status: 'ok' } );
		if ( ( result as { status: string } ).status !== 'ok' ) {
			throw new Error( 'expected ok result' );
		}
		const ok = result as { status: 'ok'; project: { path: string } };
		expect( ok.project.path ).toBe( path.join( parent, 'Brand New' ) );
		expect( fs.existsSync( ok.project.path ) ).toBe( true );
		expect( listProjects() ).toHaveLength( 1 );
	} );

	test( 'returns target-exists when the resolved folder already has files', async () => {
		const parent = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-cn-parent-' )
		);
		const target = path.join( parent, 'Existing' );
		fs.mkdirSync( target );
		fs.writeFileSync( path.join( target, 'note.md' ), 'hello' );

		const result = await projectCreateNew.invoke( event, {
			name: 'Existing',
			parentDir: parent,
		} );
		expect( result ).toEqual( {
			status: 'target-exists',
			targetPath: target,
		} );
		expect( listProjects() ).toHaveLength( 0 );
	} );

	test( 'allows reusing an empty target folder', async () => {
		const parent = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-cn-parent-' )
		);
		const target = path.join( parent, 'Empty' );
		fs.mkdirSync( target );

		const result = await projectCreateNew.invoke( event, {
			name: 'Empty',
			parentDir: parent,
		} );
		expect( result ).toMatchObject( { status: 'ok' } );
	} );

	test( 'falls back to the default parent when none is given', async () => {
		const result = await projectCreateNew.invoke( event, {
			name: 'Default Home',
		} );
		expect( result ).toMatchObject( { status: 'ok' } );
		const ok = result as { status: 'ok'; project: { path: string } };
		expect( ok.project.path ).toBe(
			path.join( mocks.documentsDir, 'Studio Write', 'Default Home' )
		);
	} );

	test( 'rejects duplicate path with already-linked', async () => {
		const parent = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-cn-parent-' )
		);
		const first = await projectCreateNew.invoke( event, {
			name: 'Original',
			parentDir: parent,
		} );
		expect( first ).toMatchObject( { status: 'ok' } );

		const second = await projectCreateNew.invoke( event, {
			name: 'Original',
			parentDir: parent,
		} );
		expect( second ).toMatchObject( { status: 'already-linked' } );
		expect( listProjects() ).toHaveLength( 1 );
	} );

	test( 'seeds <project>/checks/ with the bundled defaults', async () => {
		const parent = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-cn-parent-' )
		);
		const result = await projectCreateNew.invoke( event, {
			name: 'Seeded',
			parentDir: parent,
		} );
		expect( result ).toMatchObject( { status: 'ok' } );
		const ok = result as { status: 'ok'; project: { path: string } };

		const checksDir = path.join( ok.project.path, 'checks' );
		expect( fs.existsSync( checksDir ) ).toBe( true );

		const bundledDir = path.join(
			process.cwd(),
			'resources',
			'checks-defaults'
		);
		const bundled = fs
			.readdirSync( bundledDir )
			.filter( ( n ) => n.toLowerCase().endsWith( '.md' ) )
			.sort();
		const seeded = fs.readdirSync( checksDir ).sort();
		expect( seeded ).toEqual( bundled );

		// At least one representative default must be byte-equal to its source.
		const sample = 'brevity.md';
		expect( bundled ).toContain( sample );
		expect( fs.readFileSync( path.join( checksDir, sample ) ) ).toEqual(
			fs.readFileSync( path.join( bundledDir, sample ) )
		);
	} );
} );
