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

import { draftsMarkDone } from '../../src/main/channels/drafts-mark-done';
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

function makeProjectWithDraft(
	relPath: string,
	body = '# Draft\n'
): { project: Project; draftsDir: string; doneDir: string } {
	const workDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'sw-mark-done-project-' )
	);
	const draftsDir = path.join( workDir, 'drafts' );
	const doneDir = path.join( workDir, 'done' );
	fs.mkdirSync( draftsDir, { recursive: true } );
	fs.writeFileSync( path.join( draftsDir, relPath ), body );
	const project = createProject( workDir );
	return { project, draftsDir, doneDir };
}

beforeEach( () => {
	mocks.userDataDir = fs.mkdtempSync(
		path.join( os.tmpdir(), 'sw-mark-done-' )
	);
} );

describe( 'drafts:markDone', () => {
	test( 'moves drafts/<rel> to done/<rel> and returns ok with the new name', async () => {
		const { project, draftsDir, doneDir } = makeProjectWithDraft(
			'note.md',
			'# Hello\n'
		);

		const result = ( await draftsMarkDone.invoke( {} as never, {
			projectId: project.id,
			relPath: 'note.md',
		} ) ) as { ok: true; relPath: string };

		expect( result.ok ).toBe( true );
		expect( result.relPath ).toBe( 'note.md' );
		expect( fs.existsSync( path.join( draftsDir, 'note.md' ) ) ).toBe(
			false
		);
		expect(
			fs.readFileSync( path.join( doneDir, 'note.md' ), 'utf-8' )
		).toBe( '# Hello\n' );
	} );

	test( 'creates done/ on demand', async () => {
		const { project, doneDir } = makeProjectWithDraft( 'note.md' );
		expect( fs.existsSync( doneDir ) ).toBe( false );

		const result = ( await draftsMarkDone.invoke( {} as never, {
			projectId: project.id,
			relPath: 'note.md',
		} ) ) as { ok: true; relPath: string };

		expect( result.ok ).toBe( true );
		expect( fs.existsSync( doneDir ) ).toBe( true );
	} );

	test( 'auto-suffixes -2 / -3 on collisions in done/', async () => {
		const { project, doneDir } = makeProjectWithDraft( 'note.md' );
		fs.mkdirSync( doneDir, { recursive: true } );
		fs.writeFileSync( path.join( doneDir, 'note.md' ), 'older\n' );
		fs.writeFileSync( path.join( doneDir, 'note-2.md' ), 'older2\n' );

		const result = ( await draftsMarkDone.invoke( {} as never, {
			projectId: project.id,
			relPath: 'note.md',
		} ) ) as { ok: true; relPath: string };

		expect( result.ok ).toBe( true );
		expect( result.relPath ).toBe( 'note-3.md' );
		// Existing files in done/ are not clobbered.
		expect(
			fs.readFileSync( path.join( doneDir, 'note.md' ), 'utf-8' )
		).toBe( 'older\n' );
		expect(
			fs.readFileSync( path.join( doneDir, 'note-2.md' ), 'utf-8' )
		).toBe( 'older2\n' );
	} );

	test( 'rejects path-traversal escape attempts', async () => {
		const { project } = makeProjectWithDraft( 'note.md' );

		const result = ( await draftsMarkDone.invoke( {} as never, {
			projectId: project.id,
			relPath: '../escape.md',
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	test( 'returns not-found for unknown project ids', async () => {
		const result = ( await draftsMarkDone.invoke( {} as never, {
			projectId: randomUUID(),
			relPath: 'note.md',
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	test( 'returns not-found when the source file is missing', async () => {
		const { project } = makeProjectWithDraft( 'note.md' );

		const result = ( await draftsMarkDone.invoke( {} as never, {
			projectId: project.id,
			relPath: 'does-not-exist.md',
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );
} );
