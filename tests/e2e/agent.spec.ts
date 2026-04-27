import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test.describe( 'agent: real Claude round-trip', () => {
	test.describe.configure( { retries: 2, timeout: 180_000 } );

	test( 'sends a prompt and streams a response back into the transcript', async () => {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if ( ! apiKey ) {
			throw new Error(
				'ANTHROPIC_API_KEY is not set. Export it in your shell or add it to ' +
					'.env in the repo root, then re-run `npm test`. This suite makes ' +
					'real calls to the Claude API and cannot run without a key.'
			);
		}

		const fixture = seedLinkedProjects( 1 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				ANTHROPIC_API_KEY: apiKey,
				CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const pageErrors: string[] = [];
		win.on( 'pageerror', ( e ) => pageErrors.push( e.message ) );

		const input = win.locator( '[data-testid=chat-input]' );
		const send = win.locator( '[data-testid=send-button]' );
		const transcript = win.locator( '[data-testid=transcript]' );

		// Constrain the prompt so the output shape is deterministic enough to
		// assert on, even as the model iterates.
		const prompt =
			'Reply with exactly this JSON, no other text, no markdown: ' +
			'{"status":"ok","echo":"ping"}';
		await expect( input ).toBeEnabled();
		await input.fill( prompt );
		await send.click();

		const userBubble = transcript
			.locator( '[data-testid=bubble-user]' )
			.first();
		await expect( userBubble ).toBeVisible( { timeout: 10_000 } );
		await expect( userBubble ).toContainText( 'Reply with exactly' );

		const assistantBubble = transcript
			.locator( '[data-testid=bubble-assistant]' )
			.first();
		await expect( assistantBubble ).toBeVisible( { timeout: 60_000 } );
		await expect( assistantBubble ).toHaveAttribute(
			'data-streaming',
			'false',
			{
				timeout: 120_000,
			}
		);

		const raw =
			( await assistantBubble.locator( '.bubble-text' ).textContent() ) ??
			'';
		const jsonMatch = raw.match( /\{[\s\S]*\}/ );
		expect(
			jsonMatch,
			`response did not contain JSON: ${ raw }`
		).not.toBeNull();
		const parsed = JSON.parse( jsonMatch![ 0 ] ) as {
			status?: string;
			echo?: string;
		};
		expect( parsed.status ).toBe( 'ok' );
		expect( parsed.echo ).toBe( 'ping' );

		await expect( send ).toHaveText( 'Send', { timeout: 5_000 } );
		await expect( input ).toBeEnabled();

		expect( pageErrors ).toEqual( [] );

		await app.close();
		fixture.cleanup();
	} );
} );
