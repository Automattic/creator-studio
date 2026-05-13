import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

// Regression guard for "I click Run checks and nothing happens" in OAuth
// mode. The original bug: the first-launch resolver only refreshed the
// auth-status cache when authMode was unset. A returning user with
// authMode='claude-code' already persisted ended up with a cold cache,
// which getCachedClaudeAuthStatus() reads as signed-out, so:
//
//   - agent-service.send() emitted claude_code_signed_out and bailed.
//   - runDraftChecks() returned three "Sign in to Claude in Settings to
//     run checks." errors per click.
//
// The fix warms the cache on every startup when authMode === 'claude-code'.
// These tests lock that in by simulating a returning OAuth user and asserting
// the pre-flight gate is open by the time the renderer mounts.
//
// Note on the two tests: the first one verifies the IPC `auth.status` path,
// which goes through getClaudeAuthStatus() — that helper auto-refreshes on a
// cache miss, so it passes even when the resolver is broken. It's kept as a
// basic sanity check that fake-auth works end-to-end through the renderer.
// The second test is the actual regression guard: it exercises the
// drafts:check IPC, which uses the synchronous getCachedClaudeAuthStatus()
// accessor (no auto-refresh) — exactly the path that broke before.

const SEED_FILES = {
	'drafts/sample.md':
		'---\ntitle: Sample\n---\n\nA short draft used for the check round-trip.',
};

function seedReturningOAuthUser(): {
	userDataDir: string;
	envPath: string;
	cleanup: () => void;
	fixture: ReturnType< typeof seedLinkedProjects >;
} {
	const fixture = seedLinkedProjects( 1, SEED_FILES );
	const envDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-oauth-pre-' ) );
	const envPath = path.join( envDir, '.env' );
	// "Returning user" — authMode already persisted from a previous session.
	fs.writeFileSync(
		path.join( fixture.userDataDir, 'ui-prefs.json' ),
		JSON.stringify( { authMode: 'claude-code' } ),
		'utf-8'
	);
	return {
		userDataDir: fixture.userDataDir,
		envPath,
		fixture,
		cleanup: () => {
			fs.rmSync( envDir, { recursive: true, force: true } );
			fixture.cleanup();
		},
	};
}

test.describe( 'OAuth pre-flight: returning user', () => {
	test.describe.configure( { timeout: 60_000 } );

	test( 'auth-status cache is warmed before the renderer mounts', async () => {
		const seed = seedReturningOAuthUser();
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: seed.userDataDir,
				STUDIO_WRITE_ENV_FILE: seed.envPath,
				ANTHROPIC_API_KEY: '',
				STUDIO_WRITE_FAKE_AUTH_STATUS: JSON.stringify( {
					signedIn: true,
					email: 'returning@example.test',
					subscriptionType: 'max',
				} ),
			},
		} );
		const win = await app.firstWindow();
		await expect( win.locator( '[data-testid=titlebar]' ) ).toBeVisible();

		// Sanity check that fake-auth flows through the renderer:
		// window.api.auth.status() resolves to a signed-in record by the
		// time the renderer is ready. This IPC uses the auto-refreshing
		// accessor (getClaudeAuthStatus) so it passes even when the
		// resolver doesn't warm the cache — the second test below is the
		// actual regression guard.
		const status = await win.evaluate( () => window.api.auth.status() );
		expect( status.signedIn ).toBe( true );
		expect( status.email ).toBe( 'returning@example.test' );

		await app.close();
		seed.cleanup();
	} );

	test( 'drafts:check does not return the pre-flight "Sign in to Claude" error', async () => {
		const seed = seedReturningOAuthUser();
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: seed.userDataDir,
				STUDIO_WRITE_ENV_FILE: seed.envPath,
				ANTHROPIC_API_KEY: '',
				STUDIO_WRITE_FAKE_AUTH_STATUS: JSON.stringify( {
					signedIn: true,
					email: 'returning@example.test',
				} ),
			},
		} );
		const win = await app.firstWindow();
		await expect( win.locator( '[data-testid=titlebar]' ) ).toBeVisible();

		// Call the IPC directly with a tiny body and a single check kind so
		// the test doesn't depend on the UI being on a particular screen.
		// The SDK call itself may or may not succeed (the test machine
		// generally has no real OAuth session); we don't care — we only
		// assert we got past the pre-flight gate.
		const results = await win.evaluate( () =>
			window.api.drafts.check( 'seed-0', 'A short body.', [ 'brevity' ] )
		);
		expect( results ).toHaveLength( 1 );
		// The specific string runDraftChecks emits on the cold-cache
		// regression path. If it's back, this is the most actionable thing
		// to assert against.
		const PREFLIGHT_ERROR = 'Sign in to Claude in Settings to run checks.';
		for ( const result of results ) {
			expect( result.error ).not.toBe( PREFLIGHT_ERROR );
		}

		await app.close();
		seed.cleanup();
	} );
} );
