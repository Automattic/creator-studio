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

import { notesRename } from '../../src/main/channels/notes-rename';
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
		path.join( os.tmpdir(), 'sw-notes-rename-' )
	);
} );

describe( 'notes:rename — nested sub-folder', () => {
	test( 'a note in a sub-folder stays in that sub-folder after rename', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-rename-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources', 'Logs' ), {
			recursive: true,
		} );
		fs.writeFileSync(
			path.join( workDir, 'sources', 'Logs', 'untitled.md' ),
			'---\ntitle: Untitled\n---\n',
			'utf-8'
		);

		const result = ( await notesRename.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
			relPath: path.join( 'Logs', 'untitled.md' ),
			desired: 'My Title',
			markManual: false,
		} ) ) as { ok: true; relPath: string };

		expect( result.ok ).toBe( true );
		// New filename is slugified and the file STAYS inside Logs/.
		expect( result.relPath ).toBe( path.join( 'Logs', 'my-title.md' ) );
		expect(
			fs.existsSync(
				path.join( workDir, 'sources', 'Logs', 'my-title.md' )
			)
		).toBe( true );
		// Critically, the file does NOT leak out to the sources root.
		expect(
			fs.existsSync( path.join( workDir, 'sources', 'my-title.md' ) )
		).toBe( false );
		// And the original untitled file is gone (was moved, not copied).
		expect(
			fs.existsSync(
				path.join( workDir, 'sources', 'Logs', 'untitled.md' )
			)
		).toBe( false );
	} );

	test( 'rename to the same name in a sub-folder is a no-op (preserves path)', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-rename-project-' )
		);
		const project = createProject( workDir );
		fs.mkdirSync( path.join( workDir, 'sources', 'Logs' ), {
			recursive: true,
		} );
		fs.writeFileSync(
			path.join( workDir, 'sources', 'Logs', 'my-title.md' ),
			'---\ntitle: My Title\n---\n',
			'utf-8'
		);

		const result = ( await notesRename.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
			relPath: path.join( 'Logs', 'my-title.md' ),
			desired: 'My Title',
			markManual: false,
		} ) ) as { ok: true; relPath: string };

		expect( result.ok ).toBe( true );
		expect( result.relPath ).toBe( path.join( 'Logs', 'my-title.md' ) );
		expect(
			fs.existsSync(
				path.join( workDir, 'sources', 'Logs', 'my-title.md' )
			)
		).toBe( true );
	} );

	test( 'collision in the same sub-folder appends -N', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-notes-rename-project-' )
		);
		const project = createProject( workDir );
		const logsDir = path.join( workDir, 'sources', 'Logs' );
		fs.mkdirSync( logsDir, { recursive: true } );
		fs.writeFileSync(
			path.join( logsDir, 'untitled.md' ),
			'---\ntitle: Untitled\n---\n',
			'utf-8'
		);
		// A file with the desired slug already exists in the same folder; the
		// renamer should pick `-2`.
		fs.writeFileSync(
			path.join( logsDir, 'my-title.md' ),
			'---\ntitle: My Title (existing)\n---\n',
			'utf-8'
		);

		const result = ( await notesRename.invoke( {} as never, {
			projectId: project.id,
			folder: 'sources',
			relPath: path.join( 'Logs', 'untitled.md' ),
			desired: 'My Title',
			markManual: false,
		} ) ) as { ok: true; relPath: string };

		expect( result.ok ).toBe( true );
		expect( result.relPath ).toBe( path.join( 'Logs', 'my-title-2.md' ) );
		expect(
			fs.existsSync(
				path.join( workDir, 'sources', 'Logs', 'my-title-2.md' )
			)
		).toBe( true );
		// Same-named file at the sources root must NOT block a sub-folder
		// rename — different directory, no collision.
		expect(
			fs.existsSync(
				path.join( workDir, 'sources', 'Logs', 'my-title.md' )
			)
		).toBe( true );
	} );
} );
