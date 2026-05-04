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
	dialog: {
		showOpenDialog: () =>
			Promise.resolve( { canceled: true, filePaths: [] } ),
	},
} ) );

import { resourcesDelete } from '../../src/main/channels/resources-delete';
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
		path.join( os.tmpdir(), 'sw-resources-delete-' )
	);
} );

describe( 'resources:delete', () => {
	for ( const folder of [ 'sources', 'drafts', 'published' ] as const ) {
		test( `removes the file from disk in ${ folder }/`, async () => {
			const workDir = fs.mkdtempSync(
				path.join( os.tmpdir(), 'sw-resources-delete-project-' )
			);
			fs.mkdirSync( path.join( workDir, folder ) );
			const target = path.join( workDir, folder, 'note.md' );
			fs.writeFileSync( target, '---\ntitle: Note\n---\n\nbody\n' );
			const project = createProject( workDir );

			const result = ( await resourcesDelete.invoke( {} as never, {
				projectId: project.id,
				folder,
				relPath: 'note.md',
			} ) ) as { ok: true };

			expect( result.ok ).toBe( true );
			expect( fs.existsSync( target ) ).toBe( false );
		} );
	}

	test( 'rejects path-traversal escape attempts', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-resources-delete-project-' )
		);
		// Plant a file outside drafts/ that the traversal would resolve to.
		fs.writeFileSync( path.join( workDir, 'escape.md' ), 'do not delete' );
		const project = createProject( workDir );

		const result = ( await resourcesDelete.invoke( {} as never, {
			projectId: project.id,
			folder: 'drafts',
			relPath: '../escape.md',
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
		expect( fs.existsSync( path.join( workDir, 'escape.md' ) ) ).toBe(
			true
		);
	} );

	test( 'returns not-found for missing files', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-resources-delete-project-' )
		);
		fs.mkdirSync( path.join( workDir, 'drafts' ) );
		const project = createProject( workDir );

		const result = ( await resourcesDelete.invoke( {} as never, {
			projectId: project.id,
			folder: 'drafts',
			relPath: 'never-existed.md',
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	test( 'returns not-found for unknown project ids', async () => {
		const result = ( await resourcesDelete.invoke( {} as never, {
			projectId: randomUUID(),
			folder: 'drafts',
			relPath: 'whatever.md',
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	test( 'refuses to delete directories', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-resources-delete-project-' )
		);
		const subdir = path.join( workDir, 'sources', 'sub' );
		fs.mkdirSync( subdir, { recursive: true } );
		const project = createProject( workDir );

		const result = ( await resourcesDelete.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
			relPath: 'sub',
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
		expect( fs.existsSync( subdir ) ).toBe( true );
	} );

	test( 'rejects unknown folder values', () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-resources-delete-project-' )
		);
		const project = createProject( workDir );

		expect( () =>
			resourcesDelete.invoke( {} as never, {
				projectId: project.id,
				folder: 'bogus',
				relPath: 'whatever.md',
			} )
		).toThrow();
	} );
} );
