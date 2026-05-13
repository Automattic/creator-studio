import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

let tmpDir: string;

vi.mock( 'electron', () => ( {
	app: {
		isPackaged: false,
		getPath: () => tmpDir,
		getAppPath: () => tmpDir,
	},
} ) );

vi.mock( '../../src/main/channels/utils/resource-paths', () => ( {
	resolveClaudeCodeBinary: () => '/does/not/matter',
	resolveBundledSettingsPath: () => '/does/not/matter',
} ) );

import { resolveInitialAuthMode } from '../../src/main/channels/utils/resolve-initial-auth-mode';
import {
	getCachedClaudeAuthStatus,
	refreshClaudeAuthStatus,
} from '../../src/main/channels/utils/claude-auth-status';
import {
	readStore,
	storePath,
	writeStore,
} from '../../src/main/channels/utils/ui-prefs-store';

let originalFake: string | undefined;
let originalUd: string | undefined;

beforeEach( () => {
	tmpDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-init-' ) );
	originalFake = process.env.STUDIO_WRITE_FAKE_AUTH_STATUS;
	originalUd = process.env.STUDIO_WRITE_USER_DATA_DIR;
	delete process.env.STUDIO_WRITE_USER_DATA_DIR;
} );

afterEach( async () => {
	try {
		fs.unlinkSync( storePath() );
	} catch {
		// already gone
	}
	fs.rmSync( tmpDir, { recursive: true, force: true } );
	if ( originalFake === undefined ) {
		delete process.env.STUDIO_WRITE_FAKE_AUTH_STATUS;
	} else {
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = originalFake;
	}
	if ( originalUd === undefined ) {
		delete process.env.STUDIO_WRITE_USER_DATA_DIR;
	} else {
		process.env.STUDIO_WRITE_USER_DATA_DIR = originalUd;
	}
	// Drop the in-memory cache between tests so state doesn't bleed.
	await refreshClaudeAuthStatus().catch( () => null );
} );

describe( 'resolveInitialAuthMode', () => {
	test( 'first launch with a signed-in fake status writes claude-code', async () => {
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = JSON.stringify( {
			signedIn: true,
			email: 'a@b.test',
		} );
		await resolveInitialAuthMode();
		expect( readStore().authMode ).toBe( 'claude-code' );
	} );

	test( 'first launch with signed-out fake status writes api-key', async () => {
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = JSON.stringify( {
			signedIn: false,
		} );
		await resolveInitialAuthMode();
		expect( readStore().authMode ).toBe( 'api-key' );
	} );

	test( 'returning claude-code user gets the cache warmed', async () => {
		writeStore( { authMode: 'claude-code' } );
		// Cache starts empty — emulating a fresh launch before any
		// refresh has run.
		expect( getCachedClaudeAuthStatus().signedIn ).toBe( false );
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = JSON.stringify( {
			signedIn: true,
			email: 'returning@example.test',
		} );

		await resolveInitialAuthMode();

		// Mode is preserved (no overwrite) and the cache now reflects the
		// real signed-in state, so the first agent send / draft check
		// won't trip the cold-cache "signed out" guard.
		expect( readStore().authMode ).toBe( 'claude-code' );
		expect( getCachedClaudeAuthStatus().signedIn ).toBe( true );
		expect( getCachedClaudeAuthStatus().email ).toBe(
			'returning@example.test'
		);
	} );

	test( 'returning api-key user is left alone (no probe)', async () => {
		writeStore( { authMode: 'api-key' } );
		// If the resolver wrongly probed here, this fake would seep into
		// the cache. We assert below that it didn't.
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = JSON.stringify( {
			signedIn: true,
			email: 'should-not-leak@example.test',
		} );

		await resolveInitialAuthMode();

		expect( readStore().authMode ).toBe( 'api-key' );
		expect( getCachedClaudeAuthStatus().signedIn ).toBe( false );
	} );
} );
