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
} );
