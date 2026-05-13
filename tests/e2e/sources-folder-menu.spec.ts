import fs from 'node:fs';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test.describe( 'sources folder header: add menu, create folder', () => {
	test.describe.configure( { retries: 1, timeout: 60_000 } );

	test( 'drilling into a sources subfolder reveals the same add menu', async () => {
		const fixture = seedLinkedProjects( 1, {
			'sources/notes/seed.md': '# Seed\n\nbody\n',
		} );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Open the Sources section, drill into the seeded `notes` folder.
		await win
			.locator( '[data-testid=resources-group-collapse-sources]' )
			.click();
		await win
			.locator( '[data-testid=resources-card-sources-notes]' )
			.click();

		// The folder header replaces the old breadcrumb-only chrome.
		const folderHeader = win.locator(
			'[data-testid=resources-folder-header]'
		);
		await expect( folderHeader ).toBeVisible();
		await expect( folderHeader ).toHaveAttribute(
			'data-group-key',
			'sources'
		);

		// The "+" button on the folder header opens the same four-item menu
		// the section header has, plus the new "Create folder" entry.
		await win.locator( '[data-testid=resources-folder-add]' ).click();
		const menu = win.locator( '[data-testid=resources-folder-add-menu]' );
		await expect( menu ).toBeVisible();
		for ( const id of [
			'resources-folder-add-menu-import-url',
			'resources-folder-add-menu-import-file',
			'resources-folder-add-menu-add-note',
			'resources-folder-add-menu-create-folder',
		] ) {
			await expect(
				menu.locator( `[data-testid=${ id }]` )
			).toBeVisible();
		}

		await app.close();
		fixture.cleanup();
	} );

	test( 'create folder dialog creates a real directory and drills into it', async () => {
		const fixture = seedLinkedProjects( 1 );
		const project = fixture.projects[ 0 ];
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// From the section-header menu, open Create folder.
		await win
			.locator( '[data-testid=resources-group-add-sources]' )
			.click();
		await win
			.locator(
				'[data-testid=resources-group-add-sources-menu-create-folder]'
			)
			.click();

		const dialog = win.locator( '[data-testid=create-folder-dialog]' );
		await expect( dialog ).toBeVisible();
		await dialog
			.locator( '[data-testid=create-folder-input]' )
			.fill( 'Research' );
		await dialog.locator( '[data-testid=create-folder-confirm]' ).click();

		// The new folder lands on disk and the resources view drills into it
		// (folder header shows 0 items, "Research" as the current segment).
		await expect( dialog ).toHaveCount( 0 );
		expect(
			fs
				.statSync( path.join( project.path, 'sources', 'Research' ) )
				.isDirectory()
		).toBe( true );
		const folderHeader = win.locator(
			'[data-testid=resources-folder-header]'
		);
		await expect( folderHeader ).toBeVisible();
		await expect( folderHeader ).toContainText( 'Research' );

		await app.close();
		fixture.cleanup();
	} );

	test( 'invalid folder name surfaces the helper error, no file is written', async () => {
		const fixture = seedLinkedProjects( 1 );
		const project = fixture.projects[ 0 ];
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		await win
			.locator( '[data-testid=resources-group-add-sources]' )
			.click();
		await win
			.locator(
				'[data-testid=resources-group-add-sources-menu-create-folder]'
			)
			.click();
		const dialog = win.locator( '[data-testid=create-folder-dialog]' );
		await dialog
			.locator( '[data-testid=create-folder-input]' )
			.fill( 'has/slash' );

		const helper = dialog.locator( '[data-testid=create-folder-helper]' );
		await expect( helper ).toHaveAttribute( 'data-state', 'error' );
		// The confirm stays disabled while the name is invalid.
		await expect(
			dialog.locator( '[data-testid=create-folder-confirm]' )
		).toBeDisabled();

		// Nothing was written to disk.
		expect( fs.existsSync( path.join( project.path, 'sources' ) ) ).toBe(
			false
		);

		await app.close();
		fixture.cleanup();
	} );
} );
