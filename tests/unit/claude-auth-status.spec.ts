import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock( 'electron', () => ( {
	app: {
		isPackaged: false,
		getPath: () => '',
		getAppPath: () => '',
	},
} ) );

// resolveClaudeCodeBinary is called by the probe path but we hit the
// fake-status fast path in these tests, so it never runs.
vi.mock( '../../src/main/channels/utils/resource-paths', () => ( {
	resolveClaudeCodeBinary: () => '/does/not/matter',
	resolveBundledSettingsPath: () => '/does/not/matter',
} ) );

import {
	getCachedClaudeAuthStatus,
	getClaudeAuthStatus,
	refreshClaudeAuthStatus,
} from '../../src/main/channels/utils/claude-auth-status';

let originalFake: string | undefined;
let originalKey: string | undefined;

beforeEach( () => {
	originalFake = process.env.STUDIO_WRITE_FAKE_AUTH_STATUS;
	originalKey = process.env.ANTHROPIC_API_KEY;
} );

afterEach( () => {
	if ( originalFake === undefined ) {
		delete process.env.STUDIO_WRITE_FAKE_AUTH_STATUS;
	} else {
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = originalFake;
	}
	if ( originalKey === undefined ) {
		delete process.env.ANTHROPIC_API_KEY;
	} else {
		process.env.ANTHROPIC_API_KEY = originalKey;
	}
} );

describe( 'claude-auth-status (STUDIO_WRITE_FAKE_AUTH_STATUS path)', () => {
	test( 'returns signed-in shape from a valid JSON blob', async () => {
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = JSON.stringify( {
			signedIn: true,
			email: 'test@example.com',
			subscriptionType: 'max',
			authMethod: 'claude.ai',
		} );
		const status = await refreshClaudeAuthStatus();
		expect( status.signedIn ).toBe( true );
		expect( status.email ).toBe( 'test@example.com' );
		expect( status.subscriptionType ).toBe( 'max' );
		expect( status.authMethod ).toBe( 'claude.ai' );
	} );

	test( 'returns signed-out for an explicit signedIn:false', async () => {
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = JSON.stringify( {
			signedIn: false,
		} );
		const status = await refreshClaudeAuthStatus();
		expect( status ).toEqual( { signedIn: false } );
	} );

	test( 'malformed JSON falls back to signed-out, not a throw', async () => {
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = '{not-json';
		const status = await refreshClaudeAuthStatus();
		expect( status.signedIn ).toBe( false );
	} );

	test( 'cached accessor returns the most recent refresh value', async () => {
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = JSON.stringify( {
			signedIn: true,
			email: 'a@b.test',
		} );
		await refreshClaudeAuthStatus();
		expect( getCachedClaudeAuthStatus().signedIn ).toBe( true );
		expect( getCachedClaudeAuthStatus().email ).toBe( 'a@b.test' );
	} );

	test( 'getClaudeAuthStatus reuses the cache without a re-probe', async () => {
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = JSON.stringify( {
			signedIn: true,
			email: 'first@example.com',
		} );
		await refreshClaudeAuthStatus();
		// Mutate the env to a different blob; the cached helper should still
		// return the prior value because it only re-probes on cache miss.
		process.env.STUDIO_WRITE_FAKE_AUTH_STATUS = JSON.stringify( {
			signedIn: true,
			email: 'second@example.com',
		} );
		const status = await getClaudeAuthStatus();
		expect( status.email ).toBe( 'first@example.com' );
	} );
} );
