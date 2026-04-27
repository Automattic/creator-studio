import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedFolders } from '../helpers/linked-folders';

test.describe( 'folders UI + per-folder state', () => {
	test( '+ dropdown renders "Link folder" menu item and closes on escape', async () => {
		const fixture = seedLinkedFolders( 0 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const addBtn = win.locator( '[data-testid=sidebar-add]' );
		const menu = win.locator( '[data-testid=sidebar-add-menu]' );
		const linkItem = win.locator(
			'[data-testid=sidebar-add-menu-link-folder]'
		);

		await expect( addBtn ).toBeVisible();
		await expect( menu ).toHaveCount( 0 );

		await addBtn.click();
		await expect( menu ).toBeVisible();
		await expect( linkItem ).toBeVisible();
		await expect( linkItem ).toContainText( 'Link folder' );
		await expect( addBtn ).toHaveAttribute( 'aria-expanded', 'true' );

		await win.keyboard.press( 'Escape' );
		await expect( menu ).toHaveCount( 0 );
		await expect( addBtn ).toHaveAttribute( 'aria-expanded', 'false' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'switching folders via the Recent list preserves each folder transcript', async () => {
		const fixture = seedLinkedFolders( 2 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Seed persisted state for both folders so each shows up in "Recent"
		// (lastMessageAt is what makes a chat surface there).
		const seedFolderState = (
			folderPath: string,
			chatId: string,
			messages: Array< { kind: 'user' | 'assistant'; text: string } >
		): void => {
			const store = path.join( folderPath, '.creator-studio' );
			const chatsDir = path.join( store, 'chats' );
			fs.mkdirSync( chatsDir, { recursive: true } );
			fs.writeFileSync(
				path.join( store, 'chats.json' ),
				JSON.stringify( {
					chats: [
						{
							id: chatId,
							kind: 'general',
							sessionId: null,
							createdAt: 1,
							lastMessageAt: 1 + messages.length,
						},
					],
				} ),
				'utf-8'
			);
			const lines = messages.map( ( m, i ) =>
				JSON.stringify( {
					kind: m.kind,
					id: `${ m.kind }-${ i }`,
					text: m.text,
					at: 1 + i,
				} )
			);
			fs.writeFileSync(
				path.join( chatsDir, `${ chatId }.jsonl` ),
				lines.join( '\n' ) + '\n',
				'utf-8'
			);
		};

		const folderA = fixture.folders[ 0 ];
		const folderB = fixture.folders[ 1 ];
		// Folder B is more recently active, so it leads the Recent list.
		seedFolderState( folderA.path, 'chat-a', [
			{ kind: 'user', text: 'hello A' },
			{ kind: 'assistant', text: 'reply A' },
		] );
		seedFolderState( folderB.path, 'chat-b', [
			{ kind: 'user', text: 'hello B' },
		] );
		// Folder B's lastMessageAt (2) > folder A's (3)? Adjust: bump B.
		const metaB = path.join(
			folderB.path,
			'.creator-studio',
			'chats.json'
		);
		fs.writeFileSync(
			metaB,
			JSON.stringify( {
				chats: [
					{
						id: 'chat-b',
						kind: 'general',
						sessionId: null,
						createdAt: 1,
						lastMessageAt: 999,
					},
				],
			} ),
			'utf-8'
		);

		const recentA = win.locator( '[data-testid=sidebar-recent-chat-a]' );
		const recentB = win.locator( '[data-testid=sidebar-recent-chat-b]' );
		const transcript = win.locator( '[data-testid=transcript]' );

		// Folder A auto-selected; persisted messages hydrated.
		await expect(
			transcript.locator( '[data-testid=bubble-user]' )
		).toContainText( 'hello A' );

		// Both recent entries render.
		await expect( recentA ).toBeVisible();
		await expect( recentB ).toBeVisible();

		// Click into folder B's chat — transcript switches.
		await recentB.click();
		await expect( recentB ).toHaveAttribute( 'data-active', 'true' );
		await expect(
			transcript.locator( '[data-testid=bubble-user]' )
		).toContainText( 'hello B' );

		// Back to A — transcript restored.
		await recentA.click();
		await expect( recentA ).toHaveAttribute( 'data-active', 'true' );
		await expect(
			transcript.locator( '[data-testid=bubble-user]' )
		).toContainText( 'hello A' );

		await app.close();
		fixture.cleanup();
	} );
} );
