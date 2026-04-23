import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedFolders } from '../helpers/linked-folders';

test.describe( 'bash: pre-approved curl round-trip', () => {
	test.describe.configure( { retries: 2, timeout: 180_000 } );

	test( 'runs a GET curl from the allow list without prompting', async () => {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if ( ! apiKey ) {
			throw new Error(
				'ANTHROPIC_API_KEY is not set. Export it in your shell or add ' +
					'it to .env in the repo root, then re-run `npm test`. This ' +
					'suite makes real calls to the Claude API and cannot run ' +
					'without a key.'
			);
		}

		const fixture = seedLinkedFolders( 1 );
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

		await expect( input ).toBeEnabled();
		await input.fill(
			'Use the Bash tool with exactly this command: ' +
				'curl -s https://www.reddit.com/r/wordpress/top.json?t=week&limit=1 ' +
				'Then reply with just the word "done".'
		);
		await send.click();

		const bashBlock = transcript
			.locator( '[data-testid=tool-block-bash]' )
			.first();
		await expect( bashBlock ).toBeVisible( { timeout: 60_000 } );
		await expect( bashBlock ).toContainText( 'curl' );
		await expect( bashBlock ).toContainText( 'reddit.com' );

		await expect(
			win.locator( '[data-testid=permission-prompt]' )
		).toHaveCount( 0 );

		const assistantBubble = transcript
			.locator( '[data-testid=bubble-assistant]' )
			.first();
		await expect( assistantBubble ).toHaveAttribute(
			'data-streaming',
			'false',
			{ timeout: 120_000 }
		);

		expect( pageErrors ).toEqual( [] );

		await app.close();
		fixture.cleanup();
	} );
} );
