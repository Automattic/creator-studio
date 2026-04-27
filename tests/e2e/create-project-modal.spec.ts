import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test.describe( 'create-project modal', () => {
	test( 'Link project opens modal with three fields; Cancel closes it', async () => {
		const fixture = seedLinkedProjects( 0 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		const modal = win.locator( '[data-testid=create-project-modal]' );
		await expect( modal ).toHaveCount( 0 );

		await win.locator( '[data-testid=sidebar-add]' ).click();
		await win
			.locator( '[data-testid=sidebar-add-menu-link-project]' )
			.click();

		await expect( modal ).toBeVisible();
		await expect(
			modal.locator( '[data-testid=project-pick-folder]' )
		).toBeVisible();
		await expect(
			modal.locator( '[data-testid=project-name]' )
		).toBeVisible();
		await expect(
			modal.locator( '[data-testid=project-goal]' )
		).toBeVisible();

		// Create is disabled until a folder is picked AND a name is set.
		await expect(
			modal.locator( '[data-testid=project-create]' )
		).toBeDisabled();

		await modal.locator( '[data-testid=project-cancel]' ).click();
		await expect( modal ).toHaveCount( 0 );

		await app.close();
		fixture.cleanup();
	} );

	test( 'Create flow adds a project to the sidebar and Projects screen', async () => {
		const fixture = seedLinkedProjects( 0 );
		const projectPath = fs.mkdtempSync(
			path.join( os.tmpdir(), 'cs-modal-project-' )
		);

		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				CREATOR_STUDIO_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		const win = await app.firstWindow();

		// Stub the main-process native folder picker so the test doesn't depend
		// on the OS dialog (contextBridge'd functions can't be reassigned from
		// the renderer side).
		await app.evaluate( ( { dialog }, pickedPath ) => {
			dialog.showOpenDialog = ( () =>
				Promise.resolve( {
					canceled: false,
					filePaths: [ pickedPath ],
				} ) ) as typeof dialog.showOpenDialog;
		}, projectPath );

		await win.locator( '[data-testid=sidebar-add]' ).click();
		await win
			.locator( '[data-testid=sidebar-add-menu-link-project]' )
			.click();

		const modal = win.locator( '[data-testid=create-project-modal]' );
		await expect( modal ).toBeVisible();

		await modal.locator( '[data-testid=project-pick-folder]' ).click();
		// Name should auto-fill with the basename.
		await expect(
			modal.locator( '[data-testid=project-name]' )
		).toHaveValue( path.basename( projectPath ) );

		await modal
			.locator( '[data-testid=project-name]' )
			.fill( 'My Cool Project' );
		await modal
			.locator( '[data-testid=project-goal]' )
			.fill( 'Write daily summaries.' );

		await expect(
			modal.locator( '[data-testid=project-create]' )
		).toBeEnabled();
		await modal.locator( '[data-testid=project-create]' ).click();

		await expect( modal ).toHaveCount( 0 );

		// Chat view is active; the Recent section stays empty until the user
		// actually sends a message.
		await expect( win.locator( '[data-testid=transcript]' ) ).toBeVisible();
		await expect(
			win.locator( '[data-testid=sidebar-recent-empty]' )
		).toBeVisible();

		// Switch to Projects screen — card is rendered.
		await win.locator( '[data-testid=nav-projects]' ).click();
		const grid = win.locator( '[data-testid=projects-grid]' );
		await expect( grid ).toBeVisible();
		await expect( grid ).toContainText( 'My Cool Project' );
		await expect( grid ).toContainText( 'Write daily summaries.' );

		// Persisted to disk with the new fields.
		const stored = JSON.parse(
			fs.readFileSync(
				path.join( fixture.userDataDir, 'projects.json' ),
				'utf-8'
			)
		) as { projects: Array< { name: string; goal?: string } > };
		expect( stored.projects ).toHaveLength( 1 );
		expect( stored.projects[ 0 ].name ).toBe( 'My Cool Project' );
		expect( stored.projects[ 0 ].goal ).toBe( 'Write daily summaries.' );

		await app.close();
		fixture.cleanup();
		fs.rmSync( projectPath, { recursive: true, force: true } );
	} );
} );
