import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted( () => ( { userDataDir: '', appRoot: '' } ) );

vi.mock( 'electron', () => ( {
	app: {
		getPath: ( name: string ) => {
			if ( name === 'userData' ) {
				return mocks.userDataDir;
			}
			throw new Error( `Unexpected app.getPath(${ name })` );
		},
		// `resolveBundledPromptPath` falls back to `<appRoot>/resources/prompts`
		// when `process.resourcesPath` doesn't exist. Point it at the repo
		// root so the import-url templates resolve from `resources/prompts/`.
		getAppPath: () => mocks.appRoot,
	},
	dialog: {
		showOpenDialog: () =>
			Promise.resolve( { canceled: true, filePaths: [] } ),
	},
} ) );

// `resolveBundledPromptPath` reads `process.resourcesPath` first. Without a
// stub, `path.join(undefined, …)` throws — set a sentinel that won't exist
// so the dev fallback above kicks in.
( process as unknown as { resourcesPath: string } ).resourcesPath =
	'/__sw_test_nonexistent__';

import { importResolveUrl } from '../../src/main/channels/import-resolve-url';
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
		path.join( os.tmpdir(), 'sw-import-resolve-' )
	);
	// repo root = tests/unit/<spec>.spec.ts → ../../
	mocks.appRoot = path.resolve( __dirname, '..', '..' );
} );

describe( 'import:resolveUrl — subPath -> {{sourcesFolder}}', () => {
	test( 'defaults the destination to <project>/sources', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-project-' )
		);
		const project = createProject( workDir );

		const resolved = ( await importResolveUrl.invoke( {} as never, {
			url: 'https://example.com/article',
			projectId: project.id,
		} ) ) as { prompt: string } | null;

		expect( resolved ).not.toBeNull();
		expect( resolved?.prompt ).toContain(
			`${ path.resolve( workDir, 'sources' ) }/`
		);
	} );

	test( 'an explicit subPath under sources lands in the template', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-project-' )
		);
		const project = createProject( workDir );

		const resolved = ( await importResolveUrl.invoke( {} as never, {
			url: 'https://example.com/article',
			projectId: project.id,
			subPath: 'sources/notes',
		} ) ) as { prompt: string } | null;

		expect( resolved?.prompt ).toContain(
			`${ path.resolve( workDir, 'sources', 'notes' ) }/`
		);
	} );

	test( 'subPath outside sources falls back to the sources root', async () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-project-' )
		);
		const project = createProject( workDir );

		const resolved = ( await importResolveUrl.invoke( {} as never, {
			url: 'https://example.com/article',
			projectId: project.id,
			subPath: 'drafts',
		} ) ) as { prompt: string } | null;

		// Falls back to <project>/sources rather than letting `drafts/` leak
		// into the prompt — URL imports always belong under sources.
		expect( resolved?.prompt ).toContain(
			`${ path.resolve( workDir, 'sources' ) }/`
		);
		expect( resolved?.prompt ).not.toContain(
			`${ path.resolve( workDir, 'drafts' ) }/`
		);
	} );
} );
