import { test, expect, _electron as electron } from '@playwright/test';

import { seedLinkedProjects } from '../helpers/linked-projects';

test.describe( 'task system UI', () => {
	test( 'create, list and delete a task; toggle the project rail', async () => {
		const fixture = seedLinkedProjects( 1 );
		const app = await electron.launch( {
			executablePath: process.env.APP_EXECUTABLE,
			env: {
				...process.env,
				STUDIO_WRITE_USER_DATA_DIR: fixture.userDataDir,
			},
		} );
		try {
			const win = await app.firstWindow();

			// Tasks screen — empty to start.
			await win.locator( '[data-testid=nav-tasks]' ).click();
			await expect(
				win.locator( '[data-testid=screen-tasks]' )
			).toBeVisible();
			await expect(
				win.locator( '[data-testid=tasks-empty]' )
			).toBeVisible();

			// Create a manual task.
			await win.locator( '[data-testid=tasks-new-task]' ).click();
			const modal = win.locator( '[data-testid=create-task-modal]' );
			await expect( modal ).toBeVisible();
			await modal
				.locator( '[data-testid=task-name]' )
				.fill( 'Weekly digest' );
			await modal
				.locator( '[data-testid=task-instructions]' )
				.fill( 'Summarise the week.' );
			await modal.locator( '[data-testid=task-create]' ).click();
			await expect( modal ).toHaveCount( 0 );

			// It shows up under "Your tasks".
			const defRow = win.locator( '[data-testid^=task-def-row-]' );
			await expect( defRow ).toHaveCount( 1 );
			await expect( defRow ).toContainText( 'Weekly digest' );

			// Delete it via the confirm dialog.
			await win.locator( '[data-testid^=task-def-delete-]' ).click();
			await expect(
				win.locator( '[data-testid=delete-task-dialog]' )
			).toBeVisible();
			await win.locator( '[data-testid=delete-task-confirm]' ).click();
			await expect(
				win.locator( '[data-testid=tasks-empty]' )
			).toBeVisible();

			// The project Tasks rail toggles from the project titlebar.
			await win.locator( '[data-testid=nav-projects]' ).click();
			await win.locator( '[data-testid=project-card-seed-0]' ).click();
			const toggle = win.locator( '[data-testid=project-tasks-toggle]' );
			await expect( toggle ).toBeVisible();
			await expect(
				win.locator( '[data-testid=project-tasks-sidebar]' )
			).toHaveCount( 0 );
			await toggle.click();
			await expect(
				win.locator( '[data-testid=project-tasks-sidebar]' )
			).toBeVisible();
		} finally {
			await app.close();
			fixture.cleanup();
		}
	} );
} );
