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

// projectCreate (link-existing) seeds <project>/checks/ when the folder
// is empty. Point the resolver at the real repo path so the seed succeeds
// under vitest.
vi.mock( '../../src/main/channels/utils/resource-paths', () => ( {
	resolveBundledChecksDefaultsDir: () =>
		path.join( process.cwd(), 'resources', 'checks-defaults' ),
} ) );

import { projectCreate } from '../../src/main/channels/project-create';
import { listProjects } from '../../src/main/channels/utils/projects-list';

const event = {} as never;

const bundledDir = path.join( process.cwd(), 'resources', 'checks-defaults' );
const bundledMd = () =>
	fs
		.readdirSync( bundledDir )
		.filter( ( n ) => n.toLowerCase().endsWith( '.md' ) )
		.sort();

describe( 'projectCreate (link-existing folder)', () => {
	beforeEach( () => {
		mocks.userDataDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-link-userdata-' )
		);
	} );

	test( 'seeds bundled defaults when the linked folder has no checks/', async () => {
		const projectPath = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-link-target-' )
		);
		await projectCreate.invoke( event, {
			path: projectPath,
			name: 'Linked',
		} );
		const checksDir = path.join( projectPath, 'checks' );
		expect( fs.existsSync( checksDir ) ).toBe( true );
		expect( fs.readdirSync( checksDir ).sort() ).toEqual( bundledMd() );
		expect( listProjects() ).toHaveLength( 1 );
	} );

	test( 'seeds when checks/ exists but is empty', async () => {
		const projectPath = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-link-target-' )
		);
		fs.mkdirSync( path.join( projectPath, 'checks' ) );
		await projectCreate.invoke( event, {
			path: projectPath,
			name: 'Linked',
		} );
		expect(
			fs.readdirSync( path.join( projectPath, 'checks' ) ).sort()
		).toEqual( bundledMd() );
	} );

	test( 'does not clobber a user-curated checks/ folder', async () => {
		const projectPath = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-link-target-' )
		);
		const checksDir = path.join( projectPath, 'checks' );
		fs.mkdirSync( checksDir );
		fs.writeFileSync(
			path.join( checksDir, 'mine.md' ),
			'---\ntitle: Mine\nenabled: true\n---\nmy criteria'
		);
		await projectCreate.invoke( event, {
			path: projectPath,
			name: 'Linked',
		} );
		expect( fs.readdirSync( checksDir ).sort() ).toEqual( [ 'mine.md' ] );
		expect(
			fs.readFileSync( path.join( checksDir, 'mine.md' ), 'utf-8' )
		).toContain( 'my criteria' );
	} );
} );
