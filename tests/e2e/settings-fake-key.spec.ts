import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

// Drives the exact scenario from the user's check: save a syntactically valid
// but unauthorised key via the Settings modal, then send a chat message, and
// assert the surfaced error is recognisably about authentication. This is a
// real network round-trip to api.anthropic.com (a 401, no tokens consumed).
test.describe( 'settings: fake API key surfaces an auth error in the chat', () => {
	test.describe.configure( { retries: 1, timeout: 120_000 } );

	test( 'shows an Invalid-API-key error in the assistant bubble', async () => {
		const fixture = seedLinkedProjects( 1 );
		const envDir = fs.mkdtempSync( path.join( os.tmpdir(), 'sw-fake-' ) );
		const envPath = path.join( envDir, '.env' );

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

		// 1. Save a fake key via the Settings modal.
		await win.locator( '[data-testid=sidebar-settings]' ).click();
		await expect(
			win.locator( '[data-testid=settings-modal]' )
		).toBeVisible();
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
		const input = win.locator( '[data-testid=chat-input]' );
		const send = win.locator( '[data-testid=send-button]' );
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

		await app.close();
		fixture.cleanup();
		fs.rmSync( envDir, { recursive: true, force: true } );
	} );
} );
