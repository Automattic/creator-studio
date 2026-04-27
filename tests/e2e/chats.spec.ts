import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test.describe( 'chats UI: per-project tab strip + New chat', () => {
	test( 'transcript-actions row exposes the three starter buttons', async () => {
		const fixture = seedLinkedProjects( 1 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await expect(
			win.locator( '[data-testid=transcript-actions]' )
		).toBeVisible();
		await expect( win.locator( '[data-testid=chat-new]' ) ).toBeVisible();
		await expect( win.locator( '[data-testid=chat-ideas]' ) ).toBeVisible();
		await expect( win.locator( '[data-testid=chat-draft]' ) ).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'New chat creates a second tab and isolates per-chat transcripts', async () => {
		const fixture = seedLinkedProjects( 1 );
		const project = fixture.projects[ 0 ];

		// Seed two chats + their jsonls so the renderer has something to
		// distinguish tabs by on first render.
		const storeDir = path.join( project.path, '.creator-studio' );
		const chatsDir = path.join( storeDir, 'chats' );
		fs.mkdirSync( chatsDir, { recursive: true } );
		fs.writeFileSync(
			path.join( storeDir, 'chats.json' ),
			JSON.stringify( {
				chats: [
					{
						id: 'seeded-a',
						kind: 'general',
						sessionId: null,
						createdAt: 1,
						lastMessageAt: 2,
					},
					{
						id: 'seeded-b',
						kind: 'general',
						sessionId: null,
						createdAt: 3,
						lastMessageAt: 4,
					},
				],
			} ),
			'utf-8'
		);
		fs.writeFileSync(
			path.join( chatsDir, 'seeded-a.jsonl' ),
			JSON.stringify( {
				kind: 'user',
				id: 'u1',
				text: 'hello from chat A',
				at: 1,
			} ) + '\n',
			'utf-8'
		);
		fs.writeFileSync(
			path.join( chatsDir, 'seeded-b.jsonl' ),
			JSON.stringify( {
				kind: 'user',
				id: 'u2',
				text: 'hello from chat B',
				at: 1,
			} ) + '\n',
			'utf-8'
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const tabA = win.locator( '[data-testid=chat-tab-seeded-a]' );
		const tabB = win.locator( '[data-testid=chat-tab-seeded-b]' );
		const transcript = win.locator( '[data-testid=transcript]' );
		const userBubble = transcript.locator( '[data-testid=bubble-user]' );

		// Most-recent chat (seeded-b, higher lastMessageAt) is auto-active.
		await expect( tabA ).toBeVisible();
		await expect( tabB ).toBeVisible();
		await expect( tabB ).toHaveAttribute( 'data-active', 'true' );
		await expect( userBubble ).toContainText( 'hello from chat B' );

		// Clicking tab A activates it and swaps the transcript.
		await tabA.click();
		await expect( tabA ).toHaveAttribute( 'data-active', 'true' );
		await expect( tabB ).toHaveAttribute( 'data-active', 'false' );
		await expect( userBubble ).toContainText( 'hello from chat A' );

		// + New chat creates a third tab, active, with an empty transcript.
		const tabCountBefore = await win
			.locator( '[data-testid^=chat-tab-]' )
			.count();
		await win.locator( '[data-testid=chat-new]' ).click();
		await expect( win.locator( '[data-testid^=chat-tab-]' ) ).toHaveCount(
			tabCountBefore + 1
		);
		await expect( userBubble ).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );
} );
