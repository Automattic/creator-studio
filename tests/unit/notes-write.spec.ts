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

import { notesRead } from '../../src/main/channels/notes-read';
import { notesWrite } from '../../src/main/channels/notes-write';
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
		path.join( os.tmpdir(), 'sw-notes-write-' )
	);
} );

async function readBack(
	projectId: string,
	relPath: string
): Promise< {
	title: string;
	body: string;
	frontmatter: Record< string, unknown >;
	mtime: number;
} | null > {
	return ( await notesRead.invoke( {} as never, {
		projectId,
		relPath,
	} ) ) as Awaited< ReturnType< typeof readBack > >;
}

describe( 'notes:write', () => {
	test( 'rejects path-traversal escape attempts', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-write-project-' )
		);
		const project = createProject( workDir );

		const result = ( await notesWrite.invoke( {} as never, {
			projectId: project.id,
			relPath: '../escape.md',
			title: 'x',
			body: 'x',
			frontmatter: {},
			expectedMtime: null,
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );

	test( 'round-trip: write then read returns the same body and title', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-write-project-' )
		);
		fs.mkdirSync( path.join( workDir, 'drafts' ) );
		fs.writeFileSync(
			path.join( workDir, 'drafts', 'note.md' ),
			'---\ntitle: Old\ndescription: keep me\n---\n\nOriginal body.\n'
		);
		const project = createProject( workDir );

		const written = ( await notesWrite.invoke( {} as never, {
			projectId: project.id,
			relPath: 'note.md',
			title: 'New title',
			body: 'New body content.\n',
			frontmatter: { title: 'Old', description: 'keep me' },
			expectedMtime: null,
		} ) ) as { ok: true; mtime: number };
		expect( written.ok ).toBe( true );

		const read = await readBack( project.id, 'note.md' );
		expect( read ).not.toBeNull();
		expect( read?.title ).toBe( 'New title' );
		expect( read?.body.trim() ).toBe( 'New body content.' );
		// `description` was passed in `frontmatter` so it must round-trip.
		expect( read?.frontmatter.description ).toBe( 'keep me' );
	} );

	test( 'creates frontmatter when writing to a fresh file with title', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-write-project-' )
		);
		fs.mkdirSync( path.join( workDir, 'drafts' ) );
		const project = createProject( workDir );

		const written = ( await notesWrite.invoke( {} as never, {
			projectId: project.id,
			relPath: 'fresh.md',
			title: 'Fresh',
			body: 'Hello.\n',
			frontmatter: {},
			expectedMtime: null,
		} ) ) as { ok: true };
		expect( written.ok ).toBe( true );

		const onDisk = fs.readFileSync(
			path.join( workDir, 'drafts', 'fresh.md' ),
			'utf-8'
		);
		expect( onDisk.startsWith( '---\n' ) ).toBe( true );
		const parsed = matter( onDisk );
		expect( parsed.data.title ).toBe( 'Fresh' );
		expect( parsed.content.trim() ).toBe( 'Hello.' );
	} );

	test( 'mtime conflict: refuses to clobber when the file changed under us', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-write-project-' )
		);
		fs.mkdirSync( path.join( workDir, 'drafts' ) );
		const target = path.join( workDir, 'drafts', 'concurrent.md' );
		fs.writeFileSync( target, '---\ntitle: v1\n---\n\nv1 body.\n' );
		const project = createProject( workDir );

		// Read once to capture an mtime, then mutate the file out of band so
		// the on-disk mtime jumps forward by enough to clear the 1ms epsilon.
		const initial = await readBack( project.id, 'concurrent.md' );
		expect( initial ).not.toBeNull();
		const staleMtime = initial!.mtime;
		const future = new Date( Date.now() + 5000 );
		fs.writeFileSync(
			target,
			'---\ntitle: v2\n---\n\nv2 from elsewhere.\n'
		);
		fs.utimesSync( target, future, future );

		const result = ( await notesWrite.invoke( {} as never, {
			projectId: project.id,
			relPath: 'concurrent.md',
			title: 'v3',
			body: 'v3 body.\n',
			frontmatter: { title: 'v1' },
			expectedMtime: staleMtime,
		} ) ) as { ok: false; reason: string };

		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'mtime-conflict' );

		// File should still hold v2 — the conflict must not clobber.
		const after = fs.readFileSync( target, 'utf-8' );
		expect( after ).toContain( 'v2 from elsewhere.' );
	} );

	test( 'rejects oversize body via zod cap', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-write-project-' )
		);
		fs.mkdirSync( path.join( workDir, 'drafts' ) );
		const project = createProject( workDir );

		const oversize = 'a'.repeat( 26_000_000 );
		expect( () =>
			notesWrite.invoke( {} as never, {
				projectId: project.id,
				relPath: 'big.md',
				title: 'too big',
				body: oversize,
				frontmatter: {},
				expectedMtime: null,
			} )
		).toThrow();
	} );

	test( 'returns not-found for unknown project ids', async () => {
		const result = ( await notesWrite.invoke( {} as never, {
			projectId: randomUUID(),
			relPath: 'whatever.md',
			title: 'x',
			body: 'x',
			frontmatter: {},
			expectedMtime: null,
		} ) ) as { ok: false; reason: string };
		expect( result.ok ).toBe( false );
		expect( result.reason ).toBe( 'not-found' );
	} );
} );
