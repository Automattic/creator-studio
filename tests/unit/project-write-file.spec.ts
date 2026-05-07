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

import { projectReadFile } from '../../src/main/channels/project-read-file';
import { projectWriteFile } from '../../src/main/channels/project-write-file';
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
		path.join( os.tmpdir(), 'sw-project-write-file-' )
	);
} );

describe( 'project:writeFile', () => {
	test( 'rejects path-traversal escape attempts', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-project-write-file-project-' )
		);
		const project = createProject( workDir );

		const result = ( await projectWriteFile.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
			relPath: '../escape.txt',
			contents: 'x',
			expectedMtime: null,
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	test( 'rejects writes that resolve outside the folder root', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-project-write-file-project-' )
		);
		// Put a file inside the project but outside `sources/` so a clever
		// relPath couldn't sneak past the folder-root rail.
		fs.mkdirSync( path.join( workDir, 'drafts' ) );
		const project = createProject( workDir );

		const result = ( await projectWriteFile.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
			relPath: '../drafts/leaked.md',
			contents: 'x',
			expectedMtime: null,
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	test( 'round-trip: write then read returns the same contents', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-project-write-file-project-' )
		);
		fs.mkdirSync( path.join( workDir, 'sources' ) );
		const project = createProject( workDir );

		const written = ( await projectWriteFile.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
			relPath: 'note.txt',
			contents: 'hello world\n',
			expectedMtime: null,
		} ) ) as { ok: true; mtime: number };
		expect( written.ok ).toBe( true );

		const read = ( await projectReadFile.invoke( {} as never, {
			projectId: project.id,
			subPath: 'sources/note.txt',
		} ) ) as { text: string; mtime: number; tooLarge: boolean } | null;
		expect( read ).not.toBeNull();
		expect( read?.text ).toBe( 'hello world\n' );
	} );

	test( 'creates parent directories as needed', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-project-write-file-project-' )
		);
		const project = createProject( workDir );

		const written = ( await projectWriteFile.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
			relPath: 'nested/dir/note.txt',
			contents: 'x',
			expectedMtime: null,
		} ) ) as { ok: true };
		expect( written.ok ).toBe( true );

		const onDisk = fs.readFileSync(
			path.join( workDir, 'sources', 'nested', 'dir', 'note.txt' ),
			'utf-8'
		);
		expect( onDisk ).toBe( 'x' );
	} );

	test( 'mtime conflict: refuses to clobber when the file changed under us', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-project-write-file-project-' )
		);
		fs.mkdirSync( path.join( workDir, 'sources' ) );
		const target = path.join( workDir, 'sources', 'concurrent.txt' );
		fs.writeFileSync( target, 'v1\n' );
		const project = createProject( workDir );

		const initial = ( await projectReadFile.invoke( {} as never, {
			projectId: project.id,
			subPath: 'sources/concurrent.txt',
		} ) ) as { text: string; mtime: number; tooLarge: boolean };
		const staleMtime = initial.mtime;
		const future = new Date( Date.now() + 5000 );
		fs.writeFileSync( target, 'v2 from elsewhere\n' );
		fs.utimesSync( target, future, future );

		const result = ( await projectWriteFile.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
			relPath: 'concurrent.txt',
			contents: 'v3\n',
			expectedMtime: staleMtime,
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'mtime-conflict' );

		const after = fs.readFileSync( target, 'utf-8' );
		expect( after ).toBe( 'v2 from elsewhere\n' );
	} );

	test( 'rejects oversize contents via zod cap', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-project-write-file-project-' )
		);
		fs.mkdirSync( path.join( workDir, 'sources' ) );
		const project = createProject( workDir );

		const oversize = 'a'.repeat( 26_000_000 );
		expect( () =>
			projectWriteFile.invoke( {} as never, {
				projectId: project.id,
				folder: 'sources',
				relPath: 'big.txt',
				contents: oversize,
				expectedMtime: null,
			} )
		).toThrow();
	} );

	test( 'returns not-found for unknown project ids', async () => {
		const result = ( await projectWriteFile.invoke( {} as never, {
			projectId: randomUUID(),
			folder: 'sources',
			relPath: 'whatever.txt',
			contents: 'x',
			expectedMtime: null,
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	test( 'rejects unknown folder values via zod enum', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-project-write-file-project-' )
		);
		const project = createProject( workDir );

		expect( () =>
			projectWriteFile.invoke( {} as never, {
				projectId: project.id,
				folder: 'assets',
				relPath: 'whatever.txt',
				contents: 'x',
				expectedMtime: null,
			} )
		).toThrow();
	} );
} );
