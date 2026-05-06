import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

function writeDoneFile(
	projectPath: string,
	fileName: string,
	body: string,
	mtime?: Date
): void {
	const dir = path.join( projectPath, 'done' );
	fs.mkdirSync( dir, { recursive: true } );
	const filePath = path.join( dir, fileName );
	fs.writeFileSync( filePath, body, 'utf-8' );
	if ( mtime ) {
		fs.utimesSync( filePath, mtime, mtime );
	}
}

test.describe( 'done view', () => {
	test( 'lists items from <project>/done/, opens in editor without Mark-as-done CTA', async () => {
		const fixture = seedLinkedProjects( 2 );
		const [ projectA, projectB ] = fixture.projects;

		writeDoneFile(
			projectB.path,
			'newer.md',
			[
				'---',
				'title: Newer wrap',
				'description: Done item from B.',
				'---',
				'',
				'finished body',
			].join( '\n' ),
			new Date( '2026-04-29T10:00:00Z' )
		);
		writeDoneFile(
			projectA.path,
			'older-done.md',
			[
				'First paragraph of an older done item.',
				'',
				'Second paragraph that should be ignored.',
			].join( '\n' ),
			new Date( '2026-04-20T10:00:00Z' )
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win.locator( '[data-testid=nav-done]' ).click();

		const screen = win.locator( '[data-testid=screen-done]' );
		await expect( screen ).toBeVisible();

		const rows = win.locator( '[data-testid^=draft-row-]' );
		await expect( rows ).toHaveCount( 2 );

		// Newest first.
		await expect( rows.nth( 0 ) ).toContainText( 'Newer wrap' );
		await expect( rows.nth( 0 ) ).toContainText( 'Done item from B.' );
		await expect( rows.nth( 0 ) ).toContainText( projectB.label );
		await expect( rows.nth( 1 ) ).toContainText( 'older-done' );

		// Open the newer one in the editor.
		await rows.nth( 0 ).click();
		await expect(
			win.locator( '[data-testid=screen-draft-editor]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-editor-host]' )
		).toHaveAttribute( 'data-status', 'ready' );

		// Open the share tab; Mark-as-done is hidden for done items, but the
		// copy/save actions remain.
		await win.locator( '[data-testid=draft-sidebar-tab-share]' ).click();
		await expect(
			win.locator( '[data-testid=draft-share-panel]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-share-action-mark-done]' )
		).toHaveCount( 0 );
		await expect(
			win.locator( '[data-testid=draft-share-action-copy-md]' )
		).toBeVisible();
		await expect(
			win.locator( '[data-testid=draft-share-action-save-md]' )
		).toBeVisible();

		await app.close();
		fixture.cleanup();
	} );

	test( 'empty state when no projects have any done items', async () => {
		const fixture = seedLinkedProjects( 1 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win.locator( '[data-testid=nav-done]' ).click();
		await expect( win.locator( '[data-testid=done-empty]' ) ).toBeVisible();
		await expect( win.locator( '[data-testid^=draft-row-]' ) ).toHaveCount(
			0
		);

		await app.close();
		fixture.cleanup();
	} );
} );
