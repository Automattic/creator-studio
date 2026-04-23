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

	test( 'switching folders preserves each folder transcript in memory', async () => {
		const fixture = seedLinkedFolders( 2 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Seed a persisted jsonl for folder A so the renderer hydrates on load.
		const folderA = fixture.folders[ 0 ];
		const folderB = fixture.folders[ 1 ];
		const storeA = path.join( folderA.path, '.creator-studio', 'chats' );
		fs.mkdirSync( storeA, { recursive: true } );
		fs.writeFileSync(
			path.join( storeA, 'default.jsonl' ),
			[
				JSON.stringify( {
					kind: 'user',
					id: 'u1',
					text: 'hello A',
					at: 1,
				} ),
				JSON.stringify( {
					kind: 'assistant',
					id: 'a1',
					text: 'reply A',
					at: 2,
				} ),
			].join( '\n' ) + '\n',
			'utf-8'
		);

		const folderAButton = win.locator(
			`[data-testid=sidebar-folder-${ folderA.id }]`
		);
		const folderBButton = win.locator(
			`[data-testid=sidebar-folder-${ folderB.id }]`
		);
		const transcript = win.locator( '[data-testid=transcript]' );

		// Folder A auto-selected; persisted messages hydrated.
		await expect( folderAButton ).toHaveAttribute( 'data-active', 'true' );
		await expect(
			transcript.locator( '[data-testid=bubble-user]' )
		).toContainText( 'hello A' );
		await expect(
			transcript.locator( '[data-testid=bubble-assistant]' )
		).toContainText( 'reply A' );

		// Switch to folder B — transcript empty (no persisted history).
		await folderBButton.click();
		await expect( folderBButton ).toHaveAttribute( 'data-active', 'true' );
		await expect(
			transcript.locator( '[data-testid=bubble-user]' )
		).toHaveCount( 0 );

		// Switch back to A — transcript restored.
		await folderAButton.click();
		await expect( folderAButton ).toHaveAttribute( 'data-active', 'true' );
		await expect(
			transcript.locator( '[data-testid=bubble-user]' )
		).toContainText( 'hello A' );

		await app.close();
		fixture.cleanup();
	} );
} );
