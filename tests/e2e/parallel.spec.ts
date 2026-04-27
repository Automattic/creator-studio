import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedFolders } from '../helpers/linked-folders';

test.describe( 'parallel chats across folders', () => {
	test.describe.configure( { retries: 2, timeout: 240_000 } );

	test( 'folder B replies while folder A is still streaming', async () => {
		const apiKey = process.env.ANTHROPIC_API_KEY;
		if ( ! apiKey ) {
			throw new Error(
				'ANTHROPIC_API_KEY is not set. Export it in your shell or add it to ' +
					'.env in the repo root, then re-run `npm test`. This suite makes ' +
					'real calls to the Claude API and cannot run without a key.'
			);
		}

		const fixture = seedLinkedFolders( 2 );
		const [ folderA, folderB ] = fixture.folders;

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

		const projectsNav = win.locator( '[data-testid=nav-projects]' );
		const cardA = win.locator(
			`[data-testid=project-card-${ folderA.id }]`
		);
		const cardB = win.locator(
			`[data-testid=project-card-${ folderB.id }]`
		);
		const input = win.locator( '[data-testid=chat-input]' );
		const send = win.locator( '[data-testid=send-button]' );
		const transcript = win.locator( '[data-testid=transcript]' );

		// First seeded folder is auto-selected → composer is live.
		await expect( input ).toBeEnabled( { timeout: 10_000 } );

		// Start a long-running response in folder A.
		await input.fill(
			'Write a slow, detailed 12-line poem about autumn, each line on its own. Take your time.'
		);
		await send.click();

		const assistantA = transcript
			.locator( '[data-testid=bubble-assistant]' )
			.first();
		await expect( assistantA ).toHaveAttribute( 'data-streaming', 'true', {
			timeout: 30_000,
		} );

		// Switch to folder B via the Projects screen while A is still streaming;
		// the composer must be enabled (no pre-existing history in B, so the
		// only assistant bubble here will be the one we're about to create).
		await projectsNav.click();
		await cardB.click();
		await expect( input ).toBeEnabled();
		await expect( send ).toHaveText( 'Send' );

		await input.fill( 'Reply with exactly "B-short" and nothing else.' );
		await send.click();

		// B's response should finalize while A is still streaming.
		const assistantB = transcript
			.locator( '[data-testid=bubble-assistant]' )
			.first();
		await expect( assistantB ).toHaveAttribute( 'data-streaming', 'false', {
			timeout: 60_000,
		} );
		await expect( assistantB ).toContainText( 'B-short' );

		// Switch back to A and confirm its bubble is still streaming (or
		// has just finished) and holds its own response — i.e. the events
		// did not bleed across folders.
		await projectsNav.click();
		await cardA.click();
		const finalA = transcript
			.locator( '[data-testid=bubble-assistant]' )
			.first();
		await expect( finalA ).toHaveAttribute( 'data-streaming', 'false', {
			timeout: 120_000,
		} );
		const aText = ( await finalA.textContent() ) ?? '';
		expect( aText ).not.toContain( 'B-short' );
		expect( aText.length ).toBeGreaterThan( 40 );

		expect( pageErrors ).toEqual( [] );

		await app.close();
		fixture.cleanup();
	} );
} );
