import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedFolders } from '../helpers/linked-folders';

// Starter buttons hit the real Claude API and can take a while to produce the
// first assistant delta; keep generous retries + timeout like agent.spec.ts.
test.describe( 'starter chats: Generate ideas / Generate draft', () => {
	test.describe.configure( { retries: 2, timeout: 240_000 } );

	test( 'Generate ideas creates a fresh chat tab and streams an assistant reply', async () => {
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
		const folder = fixture.folders[ 0 ];

		// Seed two short notes so the agent has something concrete to anchor
		// ideas in.
		fs.writeFileSync(
			path.join( folder.path, 'note-a.md' ),
			'# Lessons from shipping our redesign\n\nTL;DR: staged rollouts, flags, and ruthless scope cuts.\n',
			'utf-8'
		);
		fs.writeFileSync(
			path.join( folder.path, 'note-b.md' ),
			'# Observability without tears\n\nA cheap OpenTelemetry setup that scales to a team of 3.\n',
			'utf-8'
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				ANTHROPIC_API_KEY: apiKey,
				CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const tabCountBefore = await win
			.locator( '[data-testid^=chat-tab-]' )
			.count();

		await win.locator( '[data-testid=chat-ideas]' ).click();

		// A new tab must appear and become active.
		await expect( win.locator( '[data-testid^=chat-tab-]' ) ).toHaveCount(
			tabCountBefore + 1
		);
		const activeTab = win.locator(
			'[data-testid^=chat-tab-][data-active="true"]'
		);
		await expect( activeTab ).toBeVisible();

		// The first user bubble should be the ideas prompt text.
		const userBubble = win
			.locator( '[data-testid=transcript]' )
			.locator( '[data-testid=bubble-user]' )
			.first();
		await expect( userBubble ).toContainText( 'content ideas' );

		// Eventually an assistant bubble should finish streaming (data-
		// streaming="false"). The agent may make tool calls along the way;
		// we only care that it produces a final reply.
		const finalAssistant = win.locator(
			'[data-testid=bubble-assistant][data-streaming="false"]'
		);
		await expect( finalAssistant ).toBeVisible( { timeout: 180_000 } );

		await app.close();
		fixture.cleanup();
	} );
} );
