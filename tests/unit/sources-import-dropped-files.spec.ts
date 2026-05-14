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

import { sourcesImportDroppedFiles } from '../../src/main/channels/sources-import-dropped-files';
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
		path.join( os.tmpdir(), 'sw-import-dropped-' )
	);
} );

async function invokeImport(
	projectId: string,
	subPath: string,
	paths: string[]
): Promise< {
	results: Array<
		| { ok: true; absPath: string; relPath: string; fileName: string }
		| {
				ok: false;
				absPath: string;
				reason:
					| 'not-found'
					| 'is-directory'
					| 'too-large'
					| 'io-error'
					| 'invalid-path';
		  }
	>;
} > {
	return ( await sourcesImportDroppedFiles.invoke( {} as never, {
		projectId,
		subPath,
		paths,
	} ) ) as never;
}

describe( 'sources:importDroppedFiles', () => {
	test( 'copies a real file into sources and reports the new relPath', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-project-' )
		);
		const project = createProject( workDir );
		const srcDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-src-' ) );
		const srcFile = path.join( srcDir, 'photo.png' );
		fs.writeFileSync( srcFile, Buffer.from( 'fake-png' ) );

		const r = await invokeImport( project.id, 'sources', [ srcFile ] );

		expect( r.results[ 0 ] ).toMatchObject( {
			ok: true,
			fileName: 'photo.png',
			relPath: 'photo.png',
		} );
		expect(
			fs.existsSync( path.join( workDir, 'sources', 'photo.png' ) )
		).toBe( true );
		// Source file was copied, not moved.
		expect( fs.existsSync( srcFile ) ).toBe( true );
	} );

	test( 'dedups when sources already has the same name', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources' ), { recursive: true } );
		fs.writeFileSync(
			path.join( workDir, 'sources', 'photo.png' ),
			Buffer.from( 'existing' )
		);
		const srcDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-src-' ) );
		const srcFile = path.join( srcDir, 'photo.png' );
		fs.writeFileSync( srcFile, Buffer.from( 'incoming' ) );

		const r = await invokeImport( project.id, 'sources', [ srcFile ] );
		expect( r.results[ 0 ] ).toMatchObject( {
			ok: true,
			relPath: 'photo-2.png',
		} );
	} );

	test( 'rejects directories with reason=is-directory', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-project-' )
		);
		const project = createProject( workDir );
		const srcDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-src-' ) );
		// Pass the directory itself as a "file".
		const r = await invokeImport( project.id, 'sources', [ srcDir ] );
		expect( r.results[ 0 ] ).toMatchObject( {
			ok: false,
			reason: 'is-directory',
		} );
	} );

	test( 'rejects non-existent paths with reason=not-found', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-project-' )
		);
		const project = createProject( workDir );
		const r = await invokeImport( project.id, 'sources', [
			'/nonexistent/ghost.txt',
		] );
		expect( r.results[ 0 ] ).toMatchObject( {
			ok: false,
			reason: 'not-found',
		} );
	} );

	test( 'destination outside sources/ is rejected as invalid-path', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-project-' )
		);
		const project = createProject( workDir );
		const srcDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-src-' ) );
		const srcFile = path.join( srcDir, 'a.txt' );
		fs.writeFileSync( srcFile, 'x' );
		const r = await invokeImport( project.id, 'drafts', [ srcFile ] );
		expect( r.results[ 0 ] ).toMatchObject( {
			ok: false,
			reason: 'invalid-path',
		} );
	} );

	test( 'handles a mix of accepted and rejected paths per-item', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-project-' )
		);
		const project = createProject( workDir );
		const srcDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-src-' ) );
		const ok1 = path.join( srcDir, 'a.txt' );
		fs.writeFileSync( ok1, 'x' );
		const ghost = '/nonexistent/ghost.txt';

		const r = await invokeImport( project.id, 'sources', [ ok1, ghost ] );
		expect( r.results ).toHaveLength( 2 );
		expect( r.results[ 0 ] ).toMatchObject( { ok: true } );
		expect( r.results[ 1 ] ).toMatchObject( {
			ok: false,
			reason: 'not-found',
		} );
	} );
} );
