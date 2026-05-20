import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted( () => ( { appRoot: '' } ) );

vi.mock( 'electron', () => ( {
	app: {
		// `resolveBundledPromptPath` falls back to `<appRoot>/resources/prompts`
		// when `process.resourcesPath` doesn't exist.
		getAppPath: () => mocks.appRoot,
	},
} ) );

// `resolveBundledPromptPath` reads `process.resourcesPath` first; point it at a
// path that won't exist so the dev fallback above kicks in.
( process as unknown as { resourcesPath: string } ).resourcesPath =
	'/__sw_test_nonexistent__';

import { resolveImportUrl } from '../../src/main/channels/utils/resolve-import-url';
import type { Project } from '../../src/types';

function project( workDir: string ): Project {
	return {
		id: 'test',
		path: workDir,
		label: path.basename( workDir ),
		name: path.basename( workDir ),
	};
}

beforeEach( () => {
	// repo root = tests/unit/<spec>.spec.ts → ../../
	mocks.appRoot = path.resolve( __dirname, '..', '..' );
} );

describe( 'resolveImportUrl — subPath -> {{sourcesFolder}}', () => {
	test( 'defaults the destination to <project>/sources', () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-' )
		);
		const resolved = resolveImportUrl(
			'https://example.com/article',
			project( workDir )
		);
		expect( resolved ).not.toBeNull();
		expect( resolved?.prompt ).toContain(
			`${ path.resolve( workDir, 'sources' ) }/`
		);
	} );

	test( 'an explicit subPath under sources lands in the template', () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-' )
		);
		const resolved = resolveImportUrl(
			'https://example.com/article',
			project( workDir ),
			'sources/notes'
		);
		expect( resolved?.prompt ).toContain(
			`${ path.resolve( workDir, 'sources', 'notes' ) }/`
		);
	} );

	test( 'subPath outside sources falls back to the sources root', () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-' )
		);
		const resolved = resolveImportUrl(
			'https://example.com/article',
			project( workDir ),
			'drafts'
		);
		// URL imports always belong under sources — `drafts/` must not leak.
		expect( resolved?.prompt ).toContain(
			`${ path.resolve( workDir, 'sources' ) }/`
		);
		expect( resolved?.prompt ).not.toContain(
			`${ path.resolve( workDir, 'drafts' ) }/`
		);
	} );

	test( 'returns null for an unparseable URL', () => {
		const workDir = fs.mkdtempSync(
			path.join( os.tmpdir(), 'sw-import-' )
		);
		expect(
			resolveImportUrl( 'not a url at all', project( workDir ) )
		).toBeNull();
	} );
} );
