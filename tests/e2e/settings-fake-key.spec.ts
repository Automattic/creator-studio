import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

// Drives the exact scenario from the user's check: save a syntactically valid
// but unauthorised key via the Settings modal, then send a chat message, and
// assert the surfaced error is recognisably about authentication. This is a
// real network round-trip to api.anthropic.com (a 401, no tokens consumed).
//
// Caveat: the bundled `claude` binary does env-key-first / OAuth-fallback
// selection on its own, so on a dev machine that's also signed into Claude
// Code the binary silently uses the keychain OAuth token whenever the API
// key fails. The test would then see a real Claude reply instead of an auth
// error, which is meaningless. We detect that ambient session and skip the
// test rather than ship a false negative.
function claudeCodeSignedIn(): boolean {
	try {
		const binary = path.join(
			process.cwd(),
			'node_modules/@anthropic-ai/claude-agent-sdk-' +
				`${ process.platform }-${ process.arch }/claude`
		);
		const out = execFileSync( binary, [ 'auth', 'status' ], {
			encoding: 'utf-8',
			stdio: [ 'ignore', 'pipe', 'ignore' ],
			timeout: 5_000,
		} );
		const parsed = JSON.parse( out ) as { loggedIn?: boolean };
		return parsed.loggedIn === true;
	} catch {
		return false;
	}
}

test.describe( 'settings: fake API key surfaces an auth error in the chat', () => {
	test.describe.configure( { retries: 1, timeout: 120_000 } );

	test( 'shows an Invalid-API-key error in the assistant bubble', async () => {
		test.skip(
			claudeCodeSignedIn(),
			'Skipped: ambient Claude Code OAuth session would mask the fake-key auth failure (the bundled binary falls back to keychain creds when the env key is invalid).'
		);
		const fixture = seedLinkedProjects( 1 );
		const envDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-fake-' ) );
		const envPath = path.join( envDir, '.env' );

		// Pin the user-data prefs to `authMode: 'api-key'` BEFORE the app
		// boots — otherwise `resolveInitialAuthMode()` probes the local
		// claude binary and, on a developer machine that's already signed
		// in to Claude Code, persists `authMode: 'claude-code'`. That would
		// route this test through OAuth and ignore the fake API key the
		// rest of the flow saves.
		fs.writeFileSync(
			path.join( fixture.userDataDir, 'ui-prefs.json' ),
			JSON.stringify( { authMode: 'api-key' } ),
			'utf-8'
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
				STUDIO_WRITE_ENV_FILE: envPath,
				ANTHROPIC_API_KEY: '',
			},
		} );
		const win = await app.firstWindow();

		// 1. Save a fake key via the Settings modal. Force api-key auth mode
		// so the chat actually uses the saved key (the host may default to
		// claude-code if an ambient OAuth session exists).
		await win.locator( '[data-testid=sidebar-settings]' ).click();
		await expect(
			win.locator( '[data-testid=settings-modal]' )
		).toBeVisible();
		await win.locator( '[data-testid=settings-auth-mode-api-key]' ).click();
		await win
			.locator( '[data-testid=settings-input-api-key]' )
			.fill( 'sk-ant-fake-not-a-real-key' );
		await win.locator( '[data-testid=settings-save]' ).click();
		await expect(
			win.locator( '[data-testid=settings-modal]' )
		).toHaveCount( 0 );

		// 2. Open the seeded project (sidebar Recent has no entries on a
		// fresh launch, so go via Projects → first card).
		await win.locator( '[data-testid=nav-projects]' ).click();
		await win.locator( '[data-testid^=project-card-]' ).first().click();

		// 3. Send the prompt the user gave.
		const input = win.locator( '[data-testid=draft-chat-input]' );
		const send = win.locator( '[data-testid=draft-chat-send]' );
		await expect( input ).toBeEnabled();
		await input.fill(
			"what's the latest draft in this project, give me the title"
		);
		await send.click();

		// 4. Wait for the assistant bubble to settle (errored, not streaming).
		const assistantBubble = win
			.locator( '[data-testid=bubble-assistant]' )
			.first();
		await expect( assistantBubble ).toBeVisible( { timeout: 30_000 } );
		await expect( assistantBubble ).toHaveAttribute(
			'data-streaming',
			'false',
			{ timeout: 60_000 }
		);

		const text =
			( await assistantBubble.locator( '.bubble-text' ).textContent() ) ??
			'';
		// Capture the raw text so we can iterate on the friendliness of the
		// surfaced message without re-running the full test grid.
		console.log( '[settings-fake-key] assistant bubble text:', text );

		// Loose assertion: the error text mentions auth in some recognisable
		// form. We avoid pinning to one exact phrase because the SDK wording
		// can change; the goal is "user can tell their key is invalid".
		expect( text.toLowerCase() ).toMatch(
			/invalid.*api.*key|authentication|x-api-key|401|unauthorized|unauthorised/
		);

		// And the bubble carries an "Open Settings" affordance that opens
		// the modal directly (no need to hunt for the sidebar gear).
		const openSettings = win.locator(
			'[data-testid=bubble-error-open-settings]'
		);
		await expect( openSettings ).toBeVisible();
		await openSettings.click();
		await expect(
			win.locator( '[data-testid=settings-modal]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
		fs.rmSync( envDir, { recursive: true, force: true } );
	} );
} );
