import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test.describe( 'chats UI: chat header + resources add controls', () => {
	test( 'resources area exposes per-section add controls; chat header exposes a new-chat button', async () => {
		const fixture = seedLinkedProjects( 1 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Chat header exposes a direct "new chat" button and a history popover.
		await expect(
			win.locator( '[data-testid=draft-chat-add]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-chat-history]' )
		).toBeVisible();

		// Drafts add: a single direct-action button (no menu).
		await expect(
			win.locator( '[data-testid=resources-group-add-drafts]' )
		).toBeVisible();

		// Sources add: a menu with Import URL, Import file, Add note, and
		// Create folder — all enabled in the current build.
		await win
			.locator( '[data-testid=resources-group-add-sources]' )
			.click();
		const sourcesMenu = win.locator(
			'[data-testid=resources-group-add-sources-menu]'
		);
		await expect( sourcesMenu ).toBeVisible();
		for ( const id of [
			'resources-group-add-sources-menu-import-url',
			'resources-group-add-sources-menu-import-file',
			'resources-group-add-sources-menu-add-note',
			'resources-group-add-sources-menu-create-folder',
		] ) {
			const item = sourcesMenu.locator( `[data-testid=${ id }]` );
			await expect( item ).toBeVisible();
			await expect( item ).not.toHaveAttribute( 'data-disabled', '' );
		}

		// Done section has no add control.
		await expect(
			win.locator( '[data-testid=resources-group-add-done]' )
		).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'New chat creates a fresh chat in the history popover and isolates per-chat transcripts', async () => {
		const fixture = seedLinkedProjects( 1 );
		const project = fixture.projects[ 0 ];

		// Seed two chats + their jsonls so the renderer has something to
		// distinguish tabs by on first render.
		const storeDir = path.join( project.path, '.studio-write' );
		const chatsDir = path.join( storeDir, 'chats' );
		fs.mkdirSync( chatsDir, { recursive: true } );
		fs.writeFileSync(
			path.join( storeDir, 'chats.json' ),
			JSON.stringify( {
				chats: [
					{
						id: 'seeded-a',
						sessionId: null,
						createdAt: 1,
						lastMessageAt: 2,
					},
					{
						id: 'seeded-b',
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
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const historyBtn = win.locator( '[data-testid=draft-chat-history]' );
		const transcript = win.locator( '[data-testid=draft-chat-transcript]' );
		const userBubble = transcript.locator( '[data-testid=bubble-user]' );
		const itemA = win.locator(
			'[data-testid=draft-chat-history-item-seeded-a]'
		);
		const itemB = win.locator(
			'[data-testid=draft-chat-history-item-seeded-b]'
		);

		// Most-recent chat (seeded-b, higher lastMessageAt) is auto-active.
		await expect( userBubble ).toContainText( 'hello from chat B' );

		// Switching to A via the history popover swaps the transcript.
		await historyBtn.click();
		await expect( itemA ).toBeVisible();
		await expect( itemB ).toBeVisible();
		await itemA.click();
		await expect( userBubble ).toContainText( 'hello from chat A' );

		// + New chat: button creates a fresh chat and switches to it. The
		// popover should now list one extra entry and the transcript is empty.
		await historyBtn.click();
		const popoverRows = win.locator(
			'[data-testid=draft-chat-history-popover] .chat-history-item'
		);
		const itemsBefore = await popoverRows.count();
		// Close the popover before triggering the add button (the popover's
		// outside-click handler also closes it on its own).
		await historyBtn.click();
		await win.locator( '[data-testid=draft-chat-add]' ).click();
		await expect( userBubble ).toHaveCount( 0 );
		await historyBtn.click();
		await expect( popoverRows ).toHaveCount( itemsBefore + 1 );

		await app.close();
		fixture.cleanup();
	} );
} );
