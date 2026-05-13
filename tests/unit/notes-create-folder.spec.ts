import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import matter from 'gray-matter';
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

import { notesCreate } from '../../src/main/channels/notes-create';
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
		path.join( os.tmpdir(), 'sw-notes-create-' )
	);
} );

describe( 'notes:create — folder param', () => {
	test( 'folder defaults to drafts and writes untitled.md', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-create-project-' )
		);
		const project = createProject( workDir );

		const result = ( await notesCreate.invoke( {} as never, {
			projectId: project.id,
		} ) ) as { ok: true; relPath: string; title: string };

		expect( result.ok ).toBe( true );
		expect( result.relPath ).toBe( 'untitled.md' );
		expect( result.title ).toBe( 'Untitled' );
		expect(
			fs.existsSync( path.join( workDir, 'drafts', 'untitled.md' ) )
		).toBe( true );
	} );

	test( 'folder=sources writes the file under <project>/sources/', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-create-project-' )
		);
		const project = createProject( workDir );

		const result = ( await notesCreate.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
		} ) ) as { ok: true; relPath: string; title: string };

		expect( result.ok ).toBe( true );
		expect( result.relPath ).toBe( 'untitled.md' );
		expect(
			fs.existsSync( path.join( workDir, 'sources', 'untitled.md' ) )
		).toBe( true );
		// Drafts folder must not be touched when the request targets sources.
		expect( fs.existsSync( path.join( workDir, 'drafts' ) ) ).toBe( false );
	} );

	test( 'second call into sources yields untitled-2.md (dedup)', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-create-project-' )
		);
		const project = createProject( workDir );

		const first = ( await notesCreate.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
		} ) ) as { ok: true; relPath: string };
		const second = ( await notesCreate.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
		} ) ) as { ok: true; relPath: string };

		expect( first.relPath ).toBe( 'untitled.md' );
		expect( second.relPath ).toBe( 'untitled-2.md' );
	} );

	test( 'creates frontmatter with title: Untitled on the new file', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-create-project-' )
		);
		const project = createProject( workDir );

		( await notesCreate.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
		} ) ) as { ok: true };

		const raw = fs.readFileSync(
			path.join( workDir, 'sources', 'untitled.md' ),
			'utf-8'
		);
		const parsed = matter( raw );
		expect( parsed.data.title ).toBe( 'Untitled' );
		expect( parsed.content.trim() ).toBe( '' );
	} );

	test( 'rejects unknown project id', async () => {
		const result = ( await notesCreate.invoke( {} as never, {
			projectId: randomUUID(),
			folder: 'sources',
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	test( 'rejects values outside drafts/sources', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-create-project-' )
		);
		const project = createProject( workDir );

		// 'done' is intentionally not allowed for create — done files are the
		// result of marking a draft done, not a fresh-file path. The handler
		// validates the top segment of `folder` against an allow list.
		const result = ( await notesCreate.invoke( {} as never, {
			projectId: project.id,
			folder: 'done',
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'invalid-path' );
	} );
} );
