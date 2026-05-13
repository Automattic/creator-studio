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

import { projectCreateFolder } from '../../src/main/channels/project-create-folder';
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
		path.join( os.tmpdir(), 'sw-create-folder-' )
	);
} );

describe( 'project:createFolder', () => {
	test( 'creates a folder under the sources root', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-create-folder-project-' )
		);
		const project = createProject( workDir );

		const result = ( await projectCreateFolder.invoke( {} as never, {
			projectId: project.id,
			parentSubPath: 'sources',
			name: 'notes',
		} ) ) as { ok: true; relPath: string };

		expect( result.ok ).toBe( true );
		expect( result.relPath ).toBe( path.join( 'sources', 'notes' ) );
		expect(
			fs
				.statSync( path.join( workDir, 'sources', 'notes' ) )
				.isDirectory()
		).toBe( true );
	} );

	test( 'creates a nested folder under an existing folder', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-create-folder-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources', 'notes' ), {
			recursive: true,
		} );

		const result = ( await projectCreateFolder.invoke( {} as never, {
			projectId: project.id,
			parentSubPath: 'sources/notes',
			name: 'ideas',
		} ) ) as { ok: true; relPath: string };

		expect( result.ok ).toBe( true );
		expect( result.relPath ).toBe(
			path.join( 'sources', 'notes', 'ideas' )
		);
	} );

	test( 'rejects a collision with an existing folder', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-create-folder-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources', 'notes' ), {
			recursive: true,
		} );

		const result = ( await projectCreateFolder.invoke( {} as never, {
			projectId: project.id,
			parentSubPath: 'sources',
			name: 'notes',
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'collision' );
	} );

	test( 'rejects an invalid name (slash)', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-create-folder-project-' )
		);
		const project = createProject( workDir );

		const result = ( await projectCreateFolder.invoke( {} as never, {
			projectId: project.id,
			parentSubPath: 'sources',
			name: 'foo/bar',
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'invalid-name' );
	} );

	test( 'rejects an invalid name (leading dot)', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-create-folder-project-' )
		);
		const project = createProject( workDir );

		const result = ( await projectCreateFolder.invoke( {} as never, {
			projectId: project.id,
			parentSubPath: 'sources',
			name: '.hidden',
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'invalid-name' );
	} );

	test( 'rejects a parent outside the known roots', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-create-folder-project-' )
		);
		const project = createProject( workDir );

		const result = ( await projectCreateFolder.invoke( {} as never, {
			projectId: project.id,
			parentSubPath: 'somewhere-else',
			name: 'x',
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'invalid-name' );
		expect( fs.existsSync( path.join( workDir, 'somewhere-else' ) ) ).toBe(
			false
		);
	} );

	test( 'rejects a `..` path-escape attempt', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-create-folder-project-' )
		);
		const project = createProject( workDir );

		const result = ( await projectCreateFolder.invoke( {} as never, {
			projectId: project.id,
			parentSubPath: 'sources/../..',
			name: 'escape',
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'invalid-name' );
	} );

	test( 'rejects unknown project id', async () => {
		const result = ( await projectCreateFolder.invoke( {} as never, {
			projectId: randomUUID(),
			parentSubPath: 'sources',
			name: 'notes',
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );
} );
